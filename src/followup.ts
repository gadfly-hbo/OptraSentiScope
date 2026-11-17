import {createHash, randomUUID} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {RunBinding} from '../runtime/index.ts';

export interface FollowupArtifact {artifactId:string;version:number;}
export interface FollowupOutcome {kind:'execution'|'observation';id:string;revision:number;}
export interface FollowupOutcomeContext {execution:{id:string;revision:number};}
export type FollowupTrigger={kind:'at';at:string}|{kind:'source_event';sourceIds:readonly string[];reviewAt?:string};
export interface FollowupPlan {
 requestId:string;artifact:FollowupArtifact;outcome?:FollowupOutcome;outcomeContext?:FollowupOutcomeContext;reason:string;dependencies:readonly string[];trigger:FollowupTrigger;
}
export interface FollowupRecord extends FollowupPlan {
 id:string;binding:RunBinding;createdAt:string;updatedAt:string;
 status:'waiting'|'due'|'observed'|'cancelled'|'superseded';
 schedule:{status:'none'|'creating'|'active'|'stop_pending'|'stopped'|'unknown';sessionId?:string;id?:string;binding?:RunBinding};
 previousSchedules?:FollowupRecord['schedule'][];
 dueCause?:{kind:'time'|'source_event';at:string;eventId?:string;sourceId?:string};
 observation?:{requestId:string;summary:string;at:string};
}
export interface FollowupOptions {
 isCurrent(binding:RunBinding):boolean;
 isArtifactCurrent(binding:RunBinding,artifact:FollowupArtifact):boolean;
 isOutcomeCurrent?(binding:RunBinding,outcome:FollowupOutcome,artifact:FollowupArtifact,context?:FollowupOutcomeContext):boolean;
 now?():string;
}
export interface FollowupSourceEvent {eventId:string;sourceId:string;observedAt:string;}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(value:unknown,max=12000):string=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new StoreError('invalid_followup','观察安排文本无效或超限。');return value.trim();};
const object=(value:unknown,keys:readonly string[])=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new StoreError('invalid_followup','观察安排字段无效。');return value as Record<string,unknown>;};
const instant=(value:unknown):string=>{const match=typeof value==='string'?/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value):null;
 if(!match)throw new StoreError('invalid_followup','观察时间须为带时区的有效绝对时间。');const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||Number(match[4])>23||Number(match[5])>59||Number(match[6])>59||!Number.isFinite(Date.parse(value as string)))throw new StoreError('invalid_followup','观察时间包含无效日期或时间。');return new Date(value as string).toISOString();};
/** Business observation intent and native receipts only. No timer or Agent execution authority. */
export class FollowupStore {
 readonly #store:SentiStore;readonly #scope:{owner:Owner;delegationId:string};readonly #options:FollowupOptions;readonly #namespace:string;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:FollowupOptions){
  this.#store=store;this.#scope={owner:{...scope.owner},delegationId:scope.delegationId};this.#options=options;
  store.scope(this.#scope.owner,this.#scope.delegationId);
  this.#namespace=digest([scope.owner.enterpriseId,scope.owner.principalId,scope.delegationId]);
  store.connection.exec('CREATE TABLE IF NOT EXISTS followup_intents(namespace TEXT NOT NULL,id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id),UNIQUE(namespace,request_id)); CREATE TABLE IF NOT EXISTS followup_source_events(namespace TEXT NOT NULL,event_id TEXT NOT NULL,source_id TEXT NOT NULL,observed_at TEXT NOT NULL,goal_revision INTEGER NOT NULL,epoch INTEGER NOT NULL,PRIMARY KEY(namespace,event_id))');
 }
 #now(){return instant(this.#options.now?.()??new Date().toISOString());}
 #binding(value:RunBinding):RunBinding {
  if(value?.owner?.enterpriseId!==this.#scope.owner.enterpriseId||value?.owner?.principalId!==this.#scope.owner.principalId||value.delegationId!==this.#scope.delegationId)throw new StoreError('followup_scope','观察安排不属于当前委托。',403);
  if(value.role!=='main'||![value.goalRevision,value.generation].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(value.epoch)||value.epoch<0)throw new StoreError('followup_role','只有当前主Agent可以安排观察。',403);
  return{owner:{...this.#scope.owner},delegationId:value.delegationId,goalRevision:value.goalRevision,epoch:value.epoch,generation:value.generation,role:'main'};
 }
 #current(binding:RunBinding){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);let current=false;try{current=this.#options.isCurrent(binding)===true;}catch{/* Failure does not authorize. */}
  if(d.lifecycle!=='active'||d.goalRevision!==binding.goalRevision||!current)throw new StoreError('followup_binding_stale','观察安排的当前运行资格已失效。',409);
 }
 #artifactCurrent(binding:RunBinding,artifact:FollowupArtifact,outcome?:FollowupOutcome,context?:FollowupOutcomeContext){try{return outcome?this.#options.isOutcomeCurrent?.(binding,outcome,artifact,context)===true:this.#options.isArtifactCurrent(binding,artifact)===true;}catch{return false;}}
 #sameEpoch(record:FollowupRecord,binding:RunBinding){return record.binding.goalRevision===binding.goalRevision&&record.binding.epoch===binding.epoch;}
 #write(record:FollowupRecord){record.updatedAt=this.#now();this.#store.connection.prepare('UPDATE followup_intents SET value=? WHERE namespace=? AND id=?').run(JSON.stringify(record),this.#namespace,record.id);}
 #input(value:FollowupPlan):FollowupPlan {
  const raw=object(value,['requestId','artifact','outcome','outcomeContext','reason','dependencies','trigger']);const a=object(raw.artifact,['artifactId','version']);
  if(!Number.isSafeInteger(a.version)||Number(a.version)<1)throw new StoreError('invalid_followup','观察须关联准确成果版本。');
  if(!Array.isArray(raw.dependencies)||raw.dependencies.length>50)throw new StoreError('invalid_followup','观察依赖须为有限文本列表。');
  const trigger=object(raw.trigger,['kind','at','sourceIds','reviewAt']);let normalized:FollowupTrigger;
  if(trigger.kind==='at'&&trigger.sourceIds===undefined&&trigger.reviewAt===undefined)normalized={kind:'at',at:instant(trigger.at)};
  else if(trigger.kind==='source_event'&&trigger.at===undefined&&Array.isArray(trigger.sourceIds)&&trigger.sourceIds.length>0&&trigger.sourceIds.length<=50)normalized={kind:'source_event',sourceIds:[...new Set(trigger.sourceIds.map(v=>text(v,500)))].sort(),...(trigger.reviewAt===undefined?{}:{reviewAt:instant(trigger.reviewAt)})};
  else throw new StoreError('invalid_followup','观察触发须为时间或有限来源事件条件。');
  let outcome:FollowupOutcome|undefined;if(raw.outcome!==undefined){const o=object(raw.outcome,['kind','id','revision']);if(!['execution','observation'].includes(o.kind as string)||!Number.isSafeInteger(o.revision)||Number(o.revision)<1)throw new StoreError('invalid_followup','结果复查须引用准确执行或观察修订。');outcome={kind:o.kind as FollowupOutcome['kind'],id:text(o.id,500),revision:Number(o.revision)};}
  let outcomeContext:FollowupOutcomeContext|undefined;if(raw.outcomeContext!==undefined){if(outcome?.kind!=='observation')throw new StoreError('invalid_followup','只有经营观察复查可保存当前执行上下文。');const c=object(raw.outcomeContext,['execution']),e=object(c.execution,['id','revision']);if(!Number.isSafeInteger(e.revision)||Number(e.revision)<1)throw new StoreError('invalid_followup','执行上下文须为准确修订。');outcomeContext={execution:{id:text(e.id,500),revision:Number(e.revision)}};}
  return{requestId:text(raw.requestId,500),artifact:{artifactId:text(a.artifactId,500),version:Number(a.version)},...(outcome?{outcome}:{}),...(outcomeContext?{outcomeContext}:{}),reason:text(raw.reason),dependencies:raw.dependencies.map(v=>text(v)),trigger:normalized};
 }
 plan(inputBinding:RunBinding,input:FollowupPlan):FollowupRecord {
  const binding=this.#binding(inputBinding),plan=this.#input(input);
  return this.#store.withTransaction(()=>{this.#current(binding);if(!this.#artifactCurrent(binding,plan.artifact,plan.outcome,plan.outcomeContext))throw new StoreError('followup_artifact_stale','关联成果已失去当前资格。',409);
   const requestHash=digest({goalRevision:binding.goalRevision,epoch:binding.epoch,plan});const prior=this.#store.connection.prepare('SELECT request_hash,value FROM followup_intents WHERE namespace=? AND request_id=?').get(this.#namespace,plan.requestId);
   if(prior){if(prior.request_hash!==requestHash)throw new StoreError('followup_conflict','同一观察请求不能改写内容。',409);return JSON.parse(prior.value as string) as FollowupRecord;}
   const target=plan.trigger.kind==='at'?plan.trigger.at:plan.trigger.reviewAt;if(target&&target<=this.#now())throw new StoreError('invalid_followup','新观察安排的复查时间必须在未来。');
   const now=this.#now();const record:FollowupRecord={...plan,id:randomUUID(),binding,createdAt:now,updatedAt:now,status:'waiting',schedule:{status:'none'}};
   this.#store.connection.prepare('INSERT INTO followup_intents VALUES (?,?,?,?,?)').run(this.#namespace,record.id,plan.requestId,requestHash,JSON.stringify(record));return structuredClone(record);
  });
 }
 list():FollowupRecord[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM followup_intents WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(row=>JSON.parse(row.value as string) as FollowupRecord);}
 listCurrent(inputBinding:RunBinding):FollowupRecord[]{const binding=this.#binding(inputBinding);this.#current(binding);return this.list().filter(record=>this.#sameEpoch(record,binding)&&this.#artifactCurrent(binding,record.artifact,record.outcome,record.outcomeContext));}
 reconcile(inputBinding:RunBinding):FollowupRecord[]{const binding=this.#binding(inputBinding);this.#current(binding);return this.#store.withTransaction(()=>{for(const record of this.list())if(['waiting','due'].includes(record.status)&&(!this.#sameEpoch(record,binding)||!this.#artifactCurrent(binding,record.artifact,record.outcome,record.outcomeContext))){record.status='superseded';if(record.schedule.status==='active')record.schedule.status='stop_pending';else if(record.schedule.status==='creating')record.schedule.status='unknown';this.#write(record);}return this.list();});}
 eligibleDue(inputBinding:RunBinding):FollowupRecord[]{const binding=this.#binding(inputBinding);this.#current(binding);this.reconcile(binding);return this.#store.withTransaction(()=>{for(const record of this.listCurrent(binding)){
   const target=record.trigger.kind==='at'?record.trigger.at:record.trigger.reviewAt;
   if(record.status==='waiting'&&target&&target<=this.#now()&&!['creating','unknown'].includes(record.schedule.status)){record.status='due';record.dueCause={kind:'time',at:this.#now()};this.#write(record);}
  }return this.listCurrent(binding).filter(record=>record.status==='due');});}
 due(binding:RunBinding):FollowupRecord[]{return this.eligibleDue(binding);}
 shouldObserve(binding:RunBinding):boolean{if(this.eligibleDue(binding).length)return false;return this.listCurrent(binding).some(record=>record.status==='waiting');}
 get(id:string):FollowupRecord|undefined{this.#store.scope(this.#scope.owner,this.#scope.delegationId);const row=this.#store.connection.prepare('SELECT value FROM followup_intents WHERE namespace=? AND id=?').get(this.#namespace,text(id,500));return row?JSON.parse(row.value as string) as FollowupRecord:undefined;}
 #required(id:string):FollowupRecord{const record=this.get(id);if(!record)throw new StoreError('followup_not_found','未找到该观察安排。',404);return record;}
 prepareSchedule(inputBinding:RunBinding,id:string,inputSession:string):FollowupRecord {
  if(this.#store.connection.isTransaction)throw new StoreError('followup_transaction','原生调度派发前须先提交业务事务。',409);
  const binding=this.#binding(inputBinding),sessionId=text(inputSession,500);
  return this.#store.withTransaction(()=>{this.#current(binding);const record=this.#required(id);
   if(!this.#sameEpoch(record,binding)||!this.#artifactCurrent(binding,record.artifact,record.outcome,record.outcomeContext)||record.status!=='waiting')throw new StoreError('followup_ineligible','当前观察安排不能派发。',409);
   if(!['none','stopped'].includes(record.schedule.status))throw new StoreError('followup_schedule_unknown','该调度已派发或结果未确认，不能重复创建。',409);
   const at=record.trigger.kind==='at'?record.trigger.at:record.trigger.reviewAt;if(!at||at<=this.#now())throw new StoreError('followup_time_due','复查时间不存在或已经到期，不能新建过去的定时。',409);
   if(record.schedule.status==='stopped'&&record.schedule.id)record.previousSchedules=[...record.previousSchedules??[],structuredClone(record.schedule)];record.schedule={status:'creating',sessionId,binding};this.#write(record);return structuredClone(record);
  });
 }
 attachSchedule(inputBinding:RunBinding,id:string,input:{sessionId:string;scheduleId:string}):FollowupRecord {
  const binding=this.#binding(inputBinding),raw=object(input,['sessionId','scheduleId']),sessionId=text(raw.sessionId,500),scheduleId=text(raw.scheduleId,500);
  return this.#store.withTransaction(()=>{const record=this.#required(id);if(record.schedule.sessionId!==sessionId||digest(record.schedule.binding)!==digest(binding))throw new StoreError('followup_schedule_conflict','原生调度回执不属于该派发。',409);if(record.schedule.id){if(record.schedule.id!==scheduleId)throw new StoreError('followup_schedule_conflict','原生调度回执与已保存身份冲突。',409);return record;}
   if(!['creating','unknown'].includes(record.schedule.status))throw new StoreError('followup_schedule_conflict','原生调度回执不属于该派发。',409);
   let current=false;try{this.#current(binding);current=this.#sameEpoch(record,binding)&&this.#artifactCurrent(binding,record.artifact,record.outcome,record.outcomeContext)&&record.status==='waiting'&&record.schedule.status==='creating';}catch{/* A late receipt is retained only for cleanup. */}
   const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId),pausedResponsibility=['pausing','paused','resuming'].includes(d.lifecycle)&&d.goalRevision===record.binding.goalRevision;record.schedule.id=scheduleId;record.schedule.status=current?'active':'stop_pending';if(!current&&!pausedResponsibility&&['waiting','due'].includes(record.status))record.status='superseded';this.#write(record);return structuredClone(record);
  });
 }
 scheduleUnknown(id:string):FollowupRecord {return this.#store.withTransaction(()=>{const record=this.#required(id);if(!['creating','active','stop_pending','unknown'].includes(record.schedule.status))throw new StoreError('followup_schedule_state','该观察没有已派发的调度。',409);record.schedule.status='unknown';this.#write(record);return structuredClone(record);});}
 scheduleStopped(id:string):FollowupRecord {return this.#store.withTransaction(()=>{const record=this.#required(id);if(!record.schedule.id)throw new StoreError('followup_schedule_unknown','没有准确调度身份，不能确认停止。',409);record.schedule.status='stopped';this.#write(record);return structuredClone(record);});}
 pause():FollowupRecord[]{return this.#store.withTransaction(()=>{const ending=['ending','ended'].includes(this.#store.scope(this.#scope.owner,this.#scope.delegationId).lifecycle);for(const record of this.list()){let changed=false;if(ending&&['waiting','due'].includes(record.status)){record.status='cancelled';changed=true;}if(['active','creating'].includes(record.schedule.status)){record.schedule.status=record.schedule.status==='creating'?'unknown':'stop_pending';changed=true;}if(changed)this.#write(record);}return this.list();});}
 observe(inputBinding:RunBinding,id:string,input:{requestId:string;summary:string}):FollowupRecord{const binding=this.#binding(inputBinding),raw=object(input,['requestId','summary']),requestId=text(raw.requestId,500),summary=text(raw.summary);return this.#store.withTransaction(()=>{this.#current(binding);const record=this.#required(id);if(!this.#sameEpoch(record,binding)||(record.outcome&&!this.#artifactCurrent(binding,record.artifact,record.outcome,record.outcomeContext)))throw new StoreError('followup_ineligible','旧观察安排不能写入当前检查结果。',409);
   if(record.observation){if(record.observation.requestId!==requestId||record.observation.summary!==summary)throw new StoreError('followup_conflict','已记录的观察检查不能改写。',409);return record;}
   if(record.status!=='due')throw new StoreError('followup_not_due','只有已到期或已满足事件条件的安排可以记检查结果。',409);
   record.status='observed';record.observation={requestId,summary,at:this.#now()};if(record.schedule.status==='active')record.schedule.status='stop_pending';this.#write(record);return structuredClone(record);
  });}
 cancel(inputBinding:RunBinding,id:string):FollowupRecord{const binding=this.#binding(inputBinding);return this.#store.withTransaction(()=>{this.#current(binding);const record=this.#required(id);if(!this.#sameEpoch(record,binding))throw new StoreError('followup_ineligible','旧观察安排不能更改。',409);if(['observed','superseded'].includes(record.status))throw new StoreError('followup_closed','该观察已收束，历史不能重写。',409);record.status='cancelled';if(record.schedule.status==='active')record.schedule.status='stop_pending';else if(record.schedule.status==='creating')record.schedule.status='unknown';this.#write(record);return structuredClone(record);});}
 recordSourceEvent(input:FollowupSourceEvent,qualification:{goalRevision:number;epoch:number}):FollowupRecord[]{const raw=object(input,['eventId','sourceId','observedAt']),eventId=text(raw.eventId,500),sourceId=text(raw.sourceId,500),observedAt=instant(raw.observedAt);
  if(!Number.isSafeInteger(qualification.goalRevision)||qualification.goalRevision<1||!Number.isSafeInteger(qualification.epoch)||qualification.epoch<0)throw new StoreError('invalid_followup','来源事件资格无效。');
  return this.#store.withTransaction(()=>{const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);if(d.lifecycle!=='active'||d.goalRevision!==qualification.goalRevision)return[];
   const previous=this.#store.connection.prepare('SELECT source_id,observed_at,goal_revision,epoch FROM followup_source_events WHERE namespace=? AND event_id=?').get(this.#namespace,eventId);
   if(previous){if(previous.source_id!==sourceId||previous.observed_at!==observedAt||previous.goal_revision!==qualification.goalRevision||previous.epoch!==qualification.epoch)throw new StoreError('followup_event_conflict','同一来源事件身份不能改写。',409);return[];}
   this.#store.connection.prepare('INSERT INTO followup_source_events VALUES (?,?,?,?,?,?)').run(this.#namespace,eventId,sourceId,observedAt,qualification.goalRevision,qualification.epoch);
   const due:FollowupRecord[]=[];for(const record of this.list())if(record.status==='waiting'&&record.trigger.kind==='source_event'&&record.trigger.sourceIds.includes(sourceId)&&record.binding.goalRevision===qualification.goalRevision&&record.binding.epoch===qualification.epoch&&this.#artifactCurrent(record.binding,record.artifact,record.outcome,record.outcomeContext)){
    record.status='due';record.dueCause={kind:'source_event',eventId,sourceId,at:observedAt};this.#write(record);due.push(record);
   }return due;
  });
 }
 sourceEvent(binding:RunBinding,event:Omit<FollowupSourceEvent,'observedAt'>&{observedAt?:string}):FollowupRecord[]{const normalized=this.#binding(binding);this.#current(normalized);return this.recordSourceEvent({...event,observedAt:event.observedAt??this.#now()},{goalRevision:normalized.goalRevision,epoch:normalized.epoch});}
}
