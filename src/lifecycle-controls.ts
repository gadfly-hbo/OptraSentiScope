import {createHash,randomUUID} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner,PendingOperation} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {RunBinding} from '../runtime/index.ts';

export interface LifecycleTransition {kind:'pause'|'resume';requestId:string;reason:string;at:string;since:string;}
export interface LifecycleControlState {
 revision:number;researchPaused:boolean;collectionPaused:boolean;pausedScopes:readonly string[];updatedAt:string;lastTransition?:LifecycleTransition;
}
export interface PauseResearchInput {expectedRevision:number;mode:'all'|'direction';scope?:string;reason:string;idempotencyKey:string;}
export interface ResumeResearchInput {expectedRevision:number;scope?:string;reason:string;idempotencyKey:string;}
export interface LifecycleSchedulePlan {
 id:string;delegationId:string;kind:'resume'|'end';at:string;reason:string;binding:RunBinding;createdAt:string;updatedAt:string;
 status:'pending'|'creating'|'active'|'ending'|'completed'|'cancelled'|'unknown';
 schedule:{status:'none'|'creating'|'active'|'stop_pending'|'stopped'|'unknown';sessionId?:string;id?:string;binding?:RunBinding};
 previousSchedules?:LifecycleSchedulePlan['schedule'][];
 endOperation?:Pick<PendingOperation,'id'|'requestedVersion'>;
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid():never{throw new StoreError('lifecycle_control_invalid','细粒度生命周期控制字段无效。');}
function text(value:unknown,max=12000):string{if(typeof value!=='string'||!value.trim()||value.length>max)return invalid();return value.trim();}
function instant(value:unknown):string{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return invalid();return new Date(value).toISOString();}
function scope(value:unknown):string|undefined{return value===undefined?undefined:text(value,500);}
function integer(value:unknown,min:number):number{if(!Number.isSafeInteger(value)||Number(value)<min)return invalid();return Number(value);}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))return invalid();return value as Record<string,unknown>;}

/** Host-owned lifecycle intent only; official Schedule remains the timer authority. */
export class LifecycleControlsStore {
 readonly #store:SentiStore;readonly #owner:Owner;readonly #delegationId:string;readonly #now:()=>string;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},now?:()=>string){store.scope(scope.owner,scope.delegationId);this.#store=store;this.#owner=Object.freeze({...scope.owner});this.#delegationId=scope.delegationId;this.#now=()=>now?.()??new Date().toISOString();store.connection.exec(`CREATE TABLE IF NOT EXISTS lifecycle_controls(delegation_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS lifecycle_control_requests(delegation_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(delegation_id,request_id));CREATE TABLE IF NOT EXISTS lifecycle_control_request_results(delegation_id TEXT NOT NULL,request_id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(delegation_id,request_id));CREATE TABLE IF NOT EXISTS lifecycle_schedule_plans(delegation_id TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(delegation_id,id));CREATE TABLE IF NOT EXISTS lifecycle_schedule_requests(delegation_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(delegation_id,request_id));`);}
 #state():LifecycleControlState{const row=this.#store.connection.prepare('SELECT value FROM lifecycle_controls WHERE delegation_id=?').get(this.#delegationId) as{value:string}|undefined;return row?JSON.parse(row.value):{revision:0,researchPaused:false,collectionPaused:false,pausedScopes:[],updatedAt:this.#now()};}
 #write(state:LifecycleControlState){this.#store.connection.prepare('INSERT INTO lifecycle_controls VALUES (?,?,?) ON CONFLICT(delegation_id) DO UPDATE SET revision=excluded.revision,value=excluded.value').run(this.#delegationId,state.revision,JSON.stringify(state));}
 status(){this.#store.scope(this.#owner,this.#delegationId);return structuredClone(this.#state());}
 blocksScope(value:string|undefined){const state=this.status();return state.researchPaused&&(state.pausedScopes.length===0||Boolean(value&&state.pausedScopes.some(paused=>value.trim().toLowerCase()===paused.trim().toLowerCase())));}
 #controlRequest(requestId:string,hash:string,result:()=>LifecycleControlState):LifecycleControlState{return this.#store.withTransaction(()=>{const row=this.#store.connection.prepare('SELECT request_hash FROM lifecycle_control_requests WHERE delegation_id=? AND request_id=?').get(this.#delegationId,requestId) as{request_hash:string}|undefined;if(row&&row.request_hash!==hash)throw new StoreError('lifecycle_control_conflict','同一生命周期请求不能改写。',409);if(row){const saved=this.#store.connection.prepare('SELECT value FROM lifecycle_control_request_results WHERE delegation_id=? AND request_id=?').get(this.#delegationId,requestId) as{value:string}|undefined;return saved?structuredClone(JSON.parse(saved.value)):this.status();}const value=result();this.#store.connection.prepare('INSERT INTO lifecycle_control_requests VALUES (?,?,?,?)').run(this.#delegationId,requestId,hash,this.#state().revision);this.#store.connection.prepare('INSERT INTO lifecycle_control_request_results VALUES (?,?,?)').run(this.#delegationId,requestId,JSON.stringify(value));return value;});}
 pauseResearch(input:PauseResearchInput):LifecycleControlState{
  const raw=object(input,['expectedRevision','mode','scope','reason','idempotencyKey']);const expected=integer(raw.expectedRevision,0),mode=raw.mode==='all'?'all':raw.mode==='direction'?'direction':invalid(),itemScope=scope(raw.scope),reason=text(raw.reason),requestId=text(raw.idempotencyKey,500);
  if(mode==='direction'&&!itemScope)return invalid();const hash=digest({kind:'pause',expected,mode,itemScope,reason});
  return this.#controlRequest(requestId,hash,()=>{const state=this.#state();if(expected!==state.revision)throw new StoreError('lifecycle_control_conflict','生命周期控制已有新版本。',409);const at=this.#now(),global=mode==='all'||(state.researchPaused&&state.pausedScopes.length===0);const next={...state,revision:state.revision+1,researchPaused:true,pausedScopes:global?[]:[...new Set([...state.pausedScopes,itemScope!])],updatedAt:at,lastTransition:{kind:'pause' as const,requestId,reason,at,since:state.lastTransition?.kind==='pause'?state.lastTransition.since:at}};this.#write(next);return structuredClone(next);});
 }
 resumeResearch(input:ResumeResearchInput):LifecycleControlState{
  const raw=object(input,['expectedRevision','scope','reason','idempotencyKey']);const expected=integer(raw.expectedRevision,0),itemScope=scope(raw.scope),reason=text(raw.reason),requestId=text(raw.idempotencyKey,500);const hash=digest({kind:'resume',expected,itemScope,reason});
  return this.#controlRequest(requestId,hash,()=>{const state=this.#state();if(expected!==state.revision)throw new StoreError('lifecycle_control_conflict','生命周期控制已有新版本。',409);const pausedScopes=itemScope===undefined?[]:state.pausedScopes.filter(value=>value.trim().toLowerCase()!==itemScope.trim().toLowerCase()),at=this.#now();const next={...state,revision:state.revision+1,researchPaused:pausedScopes.length>0,pausedScopes,updatedAt:at,lastTransition:{kind:'resume' as const,requestId,reason,at,since:state.lastTransition?.kind==='pause'?state.lastTransition.at:state.updatedAt}};this.#write(next);return structuredClone(next);});
 }
 plans():readonly LifecycleSchedulePlan[]{this.#store.scope(this.#owner,this.#delegationId);return this.#store.connection.prepare('SELECT value FROM lifecycle_schedule_plans WHERE delegation_id=? ORDER BY rowid').all(this.#delegationId).map(row=>JSON.parse(row.value as string));}
 plan(id:string):LifecycleSchedulePlan|undefined{return this.plans().find(item=>item.id===id);}
 schedulePlan(inputBinding:RunBinding,input:{expectedRevision:number;requestId:string;kind:'resume'|'end';at:string;reason:string}):LifecycleSchedulePlan{
  const raw=object(input,['expectedRevision','requestId','kind','at','reason']);const expected=integer(raw.expectedRevision,0),requestId=text(raw.requestId,500),kind=raw.kind==='resume'||raw.kind==='end'?raw.kind:invalid(),at=instant(raw.at),reason=text(raw.reason);if(Date.parse(at)<=Date.parse(this.#now()))throw new StoreError('lifecycle_control_invalid','约定生命周期时间必须在未来。',409);
  const hash=digest({kind:'schedule',requestId,expected,planKind:kind,at,reason});return this.#store.withTransaction(()=>{
   const prior=this.#store.connection.prepare('SELECT request_hash,id FROM lifecycle_schedule_requests WHERE delegation_id=? AND request_id=?').get(this.#delegationId,requestId) as{request_hash:string;id:string}|undefined;if(prior){if(prior.request_hash!==hash)throw new StoreError('lifecycle_control_conflict','同一生命周期约定请求不能改写。',409);return this.plan(prior.id)!;}
   if(expected!==this.#state().revision)throw new StoreError('lifecycle_control_conflict','生命周期控制已有新版本。',409);
   const id=randomUUID(),value:LifecycleSchedulePlan={id,delegationId:this.#delegationId,kind,at,reason,binding:inputBinding,createdAt:this.#now(),updatedAt:this.#now(),status:'pending',schedule:{status:'none'}};this.#store.connection.prepare('INSERT INTO lifecycle_schedule_plans VALUES (?,?,?)').run(this.#delegationId,id,JSON.stringify(value));this.#store.connection.prepare('INSERT INTO lifecycle_schedule_requests VALUES (?,?,?,?)').run(this.#delegationId,requestId,hash,id);return structuredClone(value);
  });
 }
 prepareSchedule(id:string,sessionId:string):LifecycleSchedulePlan{return this.#store.withTransaction(()=>{const value=this.plan(id);if(!value)throw new StoreError('lifecycle_control_not_found','未找到生命周期约定。',404);if(value.status!=='pending'||value.schedule.status!=='none')throw new StoreError('lifecycle_control_state','生命周期调度不能重复创建。',409);value.status='creating';value.schedule={status:'creating',sessionId,binding:value.binding};this.#writePlan(value);return structuredClone(value);});}
 attachSchedule(id:string,sessionId:string,scheduleId:string):LifecycleSchedulePlan{return this.#store.withTransaction(()=>{const value=this.plan(id);if(!value||value.schedule.sessionId!==sessionId||value.schedule.id&&value.schedule.id!==scheduleId)throw new StoreError('lifecycle_control_conflict','原生生命周期调度回执不匹配。',409);if(value.schedule.id)return structuredClone(value);value.schedule.id=scheduleId;value.schedule.status='active';value.status='active';this.#writePlan(value);return structuredClone(value);});}
 #isDue(value:LifecycleSchedulePlan,now:string):boolean {
  // Older builds marked an end completed before committing the delegation end.
  const uncommittedEnd=value.kind==='end'&&value.status==='completed'&&value.schedule.status==='stop_pending';
  return value.at<=now&&(value.status==='active'||uncommittedEnd);
 }
 duePlans():readonly LifecycleSchedulePlan[]{const now=this.#now();return this.plans().filter(value=>this.#isDue(value,now));}
 beginEnd(id:string,operation:PendingOperation):LifecycleSchedulePlan {
  return this.#store.withTransaction(()=>{
   const value=this.plan(id);
   if(value?.kind!=='end'||!this.#isDue(value,this.#now())||operation.action!=='end')throw new StoreError('lifecycle_control_state','没有匹配的到期结束约定。',409);
   value.status='ending';value.schedule.status='stop_pending';
   value.endOperation={id:operation.id,requestedVersion:operation.requestedVersion};
   this.#writePlan(value);return structuredClone(value);
  });
 }
 completePlan(id:string):LifecycleSchedulePlan {
  return this.#store.withTransaction(()=>{
   const value=this.plan(id);
   if(value?.kind==='resume'&&value.status==='active')value.schedule.status='stop_pending';
   else if(value?.kind==='end'&&value.status==='ending')value.schedule.status='stopped';
   else throw new StoreError('lifecycle_control_state','生命周期约定未到期或已收束。',409);
   value.status='completed';this.#writePlan(value);return structuredClone(value);
  });
 }
 scheduleUnknown(id:string,sessionId:string):LifecycleSchedulePlan{return this.#store.withTransaction(()=>{const value=this.plan(id);if(!value||value.schedule.sessionId!==sessionId)return value??{...this.plan(id)!};value.status='unknown';value.schedule.status='unknown';this.#writePlan(value);return structuredClone(value);});}
 scheduleStopped(id:string):LifecycleSchedulePlan{return this.#store.withTransaction(()=>{const value=this.plan(id);if(!value||!value.schedule.id)throw new StoreError('lifecycle_control_state','没有准确生命周期调度身份。',409);value.schedule.status='stopped';this.#writePlan(value);return structuredClone(value);});}
 #writePlan(value:LifecycleSchedulePlan){this.#store.connection.prepare('INSERT INTO lifecycle_schedule_plans VALUES (?,?,?) ON CONFLICT(delegation_id,id) DO UPDATE SET value=excluded.value').run(this.#delegationId,value.id,JSON.stringify(value));}
}

export interface LifecycleSummaryFact {kind:string;id:string;at?:string;detail?:string;}
export interface LifecycleSummaryRecord {id:string;kind:'resume'|'end';createdAt:string;since:string;sections:Readonly<Record<string,readonly LifecycleSummaryFact[]>>;}
export class LifecycleSummaryStore {
 readonly #store:SentiStore;readonly #owner:Owner;readonly #delegationId:string;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string}){
  store.scope(scope.owner,scope.delegationId);this.#store=store;this.#owner=Object.freeze({...scope.owner});this.#delegationId=scope.delegationId;
  store.connection.exec('CREATE TABLE IF NOT EXISTS lifecycle_summaries(delegation_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(delegation_id,kind,id));');
 }
 record(id:string,kind:'resume'|'end',since:string,sections:Readonly<Record<string,readonly LifecycleSummaryFact[]>>):LifecycleSummaryRecord {
  this.#store.scope(this.#owner,this.#delegationId);
  return this.#store.withTransaction(()=>{
   const existing=this.#store.connection.prepare('SELECT value FROM lifecycle_summaries WHERE delegation_id=? AND kind=? AND id=?').get(this.#delegationId,kind,id) as{value:string}|undefined;
   if(existing)return JSON.parse(existing.value) as LifecycleSummaryRecord;
   const value:LifecycleSummaryRecord={id,kind,since,createdAt:new Date().toISOString(),sections:structuredClone(sections)};
   this.#store.connection.prepare('INSERT INTO lifecycle_summaries VALUES (?,?,?,?)').run(this.#delegationId,id,kind,JSON.stringify(value));return structuredClone(value);
  });
 }
 list():LifecycleSummaryRecord[]{this.#store.scope(this.#owner,this.#delegationId);return this.#store.connection.prepare('SELECT value FROM lifecycle_summaries WHERE delegation_id=? ORDER BY rowid').all(this.#delegationId).map(row=>JSON.parse(row.value as string) as LifecycleSummaryRecord);}
}
