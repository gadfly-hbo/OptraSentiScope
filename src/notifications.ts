import {createHash,randomUUID} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {ArtifactReference,ArtifactRevision} from './artifacts.ts';
import type {DecisionRecord} from './decisions.ts';
import type {RunBinding} from '../runtime/index.ts';

export interface DecisionReference {id:string;revision:number;}
export interface NotificationReference {id:string;revision:number;}
export interface BriefPreferences {timeZone:string;time:string;weekdays:readonly number[];revision?:number;}
export interface SaveNotification {
 id?:string;expectedRevision:number;requestId:string;kind:'inform'|'fact'|'decision';
 artifact:ArtifactReference;decision?:DecisionReference;title:string;summary:string;changes:readonly string[];
 unknowns:readonly string[];mergeReason:string;urgency:'brief'|'immediate';immediateReason?:string;
}
export interface NotificationRevision extends Omit<SaveNotification,'id'|'expectedRevision'|'requestId'> {
 id:string;revision:number;createdAt:string;goalRevision:number;epoch:number;
 supersedes:NotificationReference|null;
}
export type ReminderPoint='remindAt'|'nextReviewAt'|'decideBy'|'executeBy';
export interface NotificationReminder {decision:DecisionReference;point:ReminderPoint;at:string;}
export interface NotificationNotice {
 id:string;kind:'brief'|'immediate'|'reminder';createdAt:string;refs:readonly NotificationReference[];
 receiver:Owner;channel:'workbench';summary?:string;reason?:string;windowKey?:string;reminder?:NotificationReminder;
}
export interface BriefCheck {windowKey:string;checkedAt:string;status:'published'|'no_change';noticeId?:string;}
export interface BriefWindow {key:string;date:string;timeZone:string;time:string;weekdays:readonly number[];preferenceRevision:number;due:boolean;}
export interface BriefResult {check:BriefCheck;notice:NotificationNotice|null;}
export interface ImmediateNotification extends NotificationReference {requestId:string;}
export interface ReminderNotification extends NotificationReference,NotificationReminder {requestId:string;reason:string;}
export interface NotificationOptions {
 isCurrent(binding:RunBinding):boolean;currentEpoch():number;
 isArtifactCurrent(ref:ArtifactReference,qualification:{goalRevision:number;epoch:number}):boolean;
 verifyArtifact(binding:RunBinding,ref:ArtifactReference):Promise<ArtifactRevision>;
 decisionCurrent?(ref:DecisionReference,qualification:{goalRevision:number;epoch:number}):boolean;
 verifyDecision?(binding:RunBinding,ref:DecisionReference):Promise<DecisionRecord>;
 preferences():BriefPreferences;now?():string;
}
export interface NotificationProjection {
 matters:readonly (NotificationRevision&{qualification:'current'})[];
 briefs:readonly ProjectedNotification[];notices:readonly ProjectedNotification[];checkState:BriefCheck|null;
}
export type ProjectedNotification=(NotificationNotice&{qualification:'current';status:'published';matters:readonly NotificationRevision[]})|{
 id:string;kind:NotificationNotice['kind'];createdAt:string;refs:readonly NotificationReference[];qualification:'unavailable';
};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function invalid():never{throw new StoreError('notification_invalid','通知字段、准确引用或时间无效。');}
function object(v:unknown,keys:readonly string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))return invalid();return v as Record<string,unknown>;}
function text(v:unknown,max=20000):string{if(typeof v!=='string'||!v.trim()||v.length>max)return invalid();return v;}
function integer(v:unknown,min=1):number{if(!Number.isSafeInteger(v)||(v as number)<min)return invalid();return v as number;}
function strings(v:unknown,min=0):readonly string[]{if(!Array.isArray(v)||v.length<min||v.length>100)return invalid();return v.map(x=>text(x));}
function instant(v:unknown):string{
 const m=typeof v==='string'?/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(v):null;if(!m)return invalid();
 const y=+m[1],mo=+m[2],d=+m[3],days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];if(mo<1||mo>12||d<1||d>days[mo-1]||+m[4]>23||+m[5]>59||+m[6]>59||!Number.isFinite(Date.parse(v as string)))return invalid();return new Date(v as string).toISOString();
}
function reference(v:unknown):NotificationReference{const r=object(v,['id','revision']);return{id:text(r.id,500),revision:integer(r.revision)};}
function artifact(v:unknown):ArtifactReference{const r=object(v,['artifactId','version']);return{artifactId:text(r.artifactId,500),version:integer(r.version)};}
function inputOf(raw:unknown):SaveNotification{
 const p=object(raw,['id','expectedRevision','requestId','kind','artifact','decision','title','summary','changes','unknowns','mergeReason','urgency','immediateReason']);
 if(!['inform','fact','decision'].includes(p.kind as string)||!['brief','immediate'].includes(p.urgency as string))return invalid();
 const decision=p.decision===undefined?undefined:reference(p.decision);if(p.kind==='decision'&&!decision)return invalid();if(p.urgency==='immediate'&&p.immediateReason===undefined)return invalid();
 const out:SaveNotification={...(p.id===undefined?{}:{id:text(p.id,500)}),expectedRevision:integer(p.expectedRevision,0),requestId:text(p.requestId,500),kind:p.kind as SaveNotification['kind'],artifact:artifact(p.artifact),...(decision?{decision}:{}),title:text(p.title,500),summary:text(p.summary),changes:strings(p.changes,1),unknowns:strings(p.unknowns),mergeReason:text(p.mergeReason),urgency:p.urgency as SaveNotification['urgency'],...(p.immediateReason===undefined?{}:{immediateReason:text(p.immediateReason)})};
 if(JSON.stringify(out).length>262144)return invalid();return out;
}
/** Business notification facts only. Native Schedule and Agent/Engine remain the execution authorities. */
export class NotificationStore {
 readonly #store:SentiStore;readonly #scope:{owner:Owner;delegationId:string};readonly #o:NotificationOptions;readonly #namespace:string;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:NotificationOptions){
  store.scope(scope.owner,scope.delegationId);this.#store=store;this.#scope={owner:{...scope.owner},delegationId:scope.delegationId};this.#o=options;this.#namespace=digest([scope.owner.enterpriseId,scope.owner.principalId,scope.delegationId]);
  store.connection.exec(`CREATE TABLE IF NOT EXISTS notification_revisions(namespace TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id,revision));
   CREATE TABLE IF NOT EXISTS notification_requests(namespace TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(namespace,request_id));
   CREATE TABLE IF NOT EXISTS notification_notices(namespace TEXT NOT NULL,id TEXT NOT NULL,dedup_key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id),UNIQUE(namespace,dedup_key));
   CREATE TABLE IF NOT EXISTS notification_delivery_requests(namespace TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,notice_id TEXT NOT NULL,PRIMARY KEY(namespace,request_id));
   CREATE TABLE IF NOT EXISTS notification_brief_checks(namespace TEXT NOT NULL,window_key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,window_key));
   CREATE TABLE IF NOT EXISTS notification_brief_requests(namespace TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,window_key TEXT NOT NULL,PRIMARY KEY(namespace,request_id));`);
 }
 #now(){return instant(this.#o.now?.()??new Date().toISOString());}
 #binding(value:RunBinding):RunBinding{
  if(value?.owner?.enterpriseId!==this.#scope.owner.enterpriseId||value?.owner?.principalId!==this.#scope.owner.principalId||value.delegationId!==this.#scope.delegationId)throw new StoreError('notification_scope','通知不属于当前委托。',403);
  if(value.role!=='main'||!Number.isSafeInteger(value.goalRevision)||value.goalRevision<1||!Number.isSafeInteger(value.epoch)||value.epoch<0||!Number.isSafeInteger(value.generation)||value.generation<1)throw new StoreError('notification_role','只有当前主Agent可以发布经营通知。',403);
  return{owner:{...this.#scope.owner},delegationId:this.#scope.delegationId,goalRevision:value.goalRevision,epoch:value.epoch,generation:value.generation,role:'main'};
 }
 #current(b:RunBinding){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);let current=false;try{current=this.#o.isCurrent(b)===true;}catch{}if(d.lifecycle!=='active'||d.goalRevision!==b.goalRevision||this.#o.currentEpoch()!==b.epoch||!current)throw new StoreError('notification_unqualified','通知的当前运行资格已失效。',409);}
 #referencesCurrent(value:Pick<NotificationRevision,'artifact'|'decision'>,q:{goalRevision:number;epoch:number}):boolean{try{return this.#o.isArtifactCurrent(value.artifact,q)===true&&(!value.decision||this.#o.decisionCurrent?.(value.decision,q)===true);}catch{return false;}}
 #revision(id:string,revision?:number):NotificationRevision|undefined{const row=revision===undefined?this.#store.connection.prepare('SELECT value FROM notification_revisions WHERE namespace=? AND id=? ORDER BY revision DESC LIMIT 1').get(this.#namespace,id):this.#store.connection.prepare('SELECT value FROM notification_revisions WHERE namespace=? AND id=? AND revision=?').get(this.#namespace,id,revision);return row?JSON.parse(row.value as string):undefined;}
 #required(ref:NotificationReference):NotificationRevision{const v=this.#revision(ref.id,ref.revision);if(!v)throw new StoreError('notification_not_found','未找到该通知事项的准确版本。',404);return v;}
 #eligible(value:NotificationRevision){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);return !['ending','ended'].includes(d.lifecycle)&&d.goalRevision===value.goalRevision&&this.#o.currentEpoch()===value.epoch&&this.#revision(value.id)?.revision===value.revision&&this.#referencesCurrent(value,value);}
 #body(value:NotificationRevision){const {id:_id,revision:_revision,createdAt:_at,goalRevision:_goal,epoch:_epoch,supersedes:_supersedes,...body}=value;return body;}
 async #verifyBody(b:RunBinding,value:Pick<NotificationRevision,'kind'|'artifact'|'decision'>):Promise<void>{
  if(this.#store.connection.isTransaction)throw new StoreError('notification_transaction','准确依据核对须在业务事务之外完成。',409);
  try{const a=await this.#o.verifyArtifact(b,structuredClone(value.artifact));this.#current(b);if(a.artifactId!==value.artifact.artifactId||a.version!==value.artifact.version||(value.kind==='decision'&&a.kind!=='plan'))throw Error();
   if(value.decision){if(!this.#o.verifyDecision)throw Error();const d=await this.#o.verifyDecision(b,structuredClone(value.decision));this.#current(b);if(d.id!==value.decision.id||d.revision!==value.decision.revision||d.qualification!=='current'||!['pending','deferred'].includes(d.status)||digest(d.artifact)!==digest(value.artifact))throw Error();}
  }catch(error){if(error instanceof StoreError&&error.code==='notification_unqualified')throw error;throw new StoreError('notification_evidence_unavailable','通知的准确依据或待决事项当前不可读取。',409);}this.#current(b);
  if(!this.#referencesCurrent(value,b))throw new StoreError('notification_stale','通知所依赖的版本或资格已变化。',409);
 }
 async #verify(b:RunBinding,value:NotificationRevision){if(!this.#eligible(value))throw new StoreError('notification_stale','历史通知须按当前依据重新建立。',409);await this.#verifyBody(b,value);if(!this.#eligible(value))throw new StoreError('notification_stale','通知核对期间已有新版本。',409);}
 history():NotificationRevision[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM notification_revisions WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(r=>JSON.parse(r.value as string));}
 meta(input:RunBinding){const b=this.#binding(input);this.#current(b);return this.history().filter(v=>this.#eligible(v)).map(v=>({id:v.id,revision:v.revision,kind:v.kind,artifact:v.artifact,...(v.decision?{decision:v.decision}:{}),createdAt:v.createdAt,urgency:v.urgency}));}
 async read(input:RunBinding,raw:NotificationReference):Promise<NotificationRevision>{const b=this.#binding(input);this.#current(b);const v=this.#required(reference(raw));await this.#verify(b,v);return structuredClone(v);}
 async currentList(input:RunBinding):Promise<readonly NotificationRevision[]>{const b=this.#binding(input);this.#current(b);const values:NotificationRevision[]=[];for(const ref of this.meta(b))values.push(await this.read(b,ref));return values;}
 async save(inputBinding:RunBinding,raw:SaveNotification):Promise<NotificationRevision>{
  const b=this.#binding(inputBinding),input=inputOf(raw),hash=digest([input,b.goalRevision,b.epoch]);this.#current(b);
  const replay=()=>{const r=this.#store.connection.prepare('SELECT request_hash,id,revision FROM notification_requests WHERE namespace=? AND request_id=?').get(this.#namespace,input.requestId);if(!r)return undefined;if(r.request_hash!==hash)throw new StoreError('notification_conflict','同一通知请求不能改写内容。',409);return this.#required({id:r.id as string,revision:r.revision as number});};
  const prior=replay();if(prior){await this.#verify(b,prior);return structuredClone(prior);}await this.#verifyBody(b,input);
  return this.#store.withTransaction(()=>{this.#current(b);const replayed=replay();if(replayed){if(!this.#eligible(replayed))throw new StoreError('notification_stale','原请求已成为历史。',409);return replayed;}
   if(!this.#referencesCurrent(input,b))throw new StoreError('notification_stale','通知提交前准确引用已失效。',409);
   const id=input.id??randomUUID(),previous=this.#revision(id);if(input.expectedRevision!==(previous?.revision??0)||(!input.id&&input.expectedRevision!==0))throw new StoreError('notification_conflict','通知事项已有新版本，请准确修订。',409);
   if(previous?.decision&&input.decision?.id!==previous.decision.id)throw new StoreError('notification_distinct_decision','独立经营选择须保留为独立事项，不能合并。',409);
   const {id:_id,expectedRevision:_expected,requestId:_request,...body}=input;
   const same=previous&&previous.goalRevision===b.goalRevision&&previous.epoch===b.epoch&&digest(this.#body(previous))===digest(body);
   const value:NotificationRevision=same?previous:{...body,id,revision:(previous?.revision??0)+1,createdAt:this.#now(),goalRevision:b.goalRevision,epoch:b.epoch,supersedes:previous?{id,revision:previous.revision}:null};
   if(!same)this.#store.connection.prepare('INSERT INTO notification_revisions VALUES (?,?,?,?)').run(this.#namespace,id,value.revision,JSON.stringify(value));
   this.#store.connection.prepare('INSERT INTO notification_requests VALUES (?,?,?,?,?)').run(this.#namespace,input.requestId,hash,id,value.revision);return structuredClone(value);
  });
 }
 briefWindow():BriefWindow{
  const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId),raw=this.#o.preferences();const p=object(raw,['timeZone','time','weekdays','revision']);const zone=text(p.timeZone,200),time=text(p.time,20),m=/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(time);
  if(!m||+m[1]>23||+m[2]>59||+m[3]>59||!Array.isArray(p.weekdays)||p.weekdays.length===0||p.weekdays.length>7||new Set(p.weekdays).size!==p.weekdays.length||p.weekdays.some(v=>!Number.isInteger(v)||v<1||v>7))return invalid();
  const revision=p.revision===undefined?1:integer(p.revision);let formatter:Intl.DateTimeFormat;try{formatter=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hourCycle:'h23'});}catch{return invalid();}
  const parts=Object.fromEntries(formatter.formatToParts(new Date(this.#now())).map(v=>[v.type,v.value]));const date=`${parts.year}-${parts.month}-${parts.day}`,weekday=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday)+1;
  const local=(+parts.hour*3600 + +parts.minute*60 + +parts.second)*1000 + +parts.fractionalSecond;const target=(+m[1]*3600 + +m[2]*60 + +m[3])*1000+ +(m[4]??'').padEnd(3,'0');
  return{key:`${date}@${zone}/${time}/r${revision}`,date,timeZone:zone,time,weekdays:[...p.weekdays] as number[],preferenceRevision:revision,due:d.lifecycle==='active'&&p.weekdays.includes(weekday)&&local>=target};
 }
 #notices():NotificationNotice[]{return this.#store.connection.prepare('SELECT value FROM notification_notices WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(r=>JSON.parse(r.value as string));}
 #check(key:string):BriefCheck|undefined{const row=this.#store.connection.prepare('SELECT value FROM notification_brief_checks WHERE namespace=? AND window_key=?').get(this.#namespace,key);return row?JSON.parse(row.value as string):undefined;}
 #briefRefs():NotificationReference[]{const done=new Set(this.#notices().filter(n=>n.kind==='brief').flatMap(n=>n.refs.map(r=>digest(r))));return this.history().filter(v=>this.#eligible(v)&&!done.has(digest({id:v.id,revision:v.revision}))).map(v=>({id:v.id,revision:v.revision}));}
 dueWork(input:RunBinding):{brief:BriefWindow|null;immediate:readonly NotificationReference[]}{const b=this.#binding(input);this.#current(b);const w=this.briefWindow(),sent=new Set(this.#notices().filter(n=>n.kind==='immediate').flatMap(n=>n.refs.map(r=>digest(r))));return{brief:w.due&&!this.#check(w.key)?w:null,immediate:this.meta(b).filter(r=>r.urgency==='immediate'&&!sent.has(digest({id:r.id,revision:r.revision}))).map(r=>({id:r.id,revision:r.revision}))};}
 async #checkedResult(b:RunBinding,check:BriefCheck):Promise<BriefResult>{const notice=check.noticeId?this.#notices().find(n=>n.id===check.noticeId):undefined;if(check.noticeId&&!notice)throw new StoreError('notification_receipt_unknown','简报站内记录尚未确认。',409);if(notice)for(const ref of notice.refs)await this.read(b,ref);return{check:structuredClone(check),notice:notice?structuredClone(notice):null};}
 async createBrief(inputBinding:RunBinding,raw:{requestId:string;windowKey:string;summary:string}):Promise<BriefResult>{
  const b=this.#binding(inputBinding),p=object(raw,['requestId','windowKey','summary']),input={requestId:text(p.requestId,500),windowKey:text(p.windowKey,1024),summary:text(p.summary)},hash=digest(input);this.#current(b);
  const replay=()=>{const r=this.#store.connection.prepare('SELECT request_hash,window_key FROM notification_brief_requests WHERE namespace=? AND request_id=?').get(this.#namespace,input.requestId);if(!r)return undefined;if(r.request_hash!==hash)throw new StoreError('notification_conflict','同一简报请求不能改写内容。',409);return this.#check(r.window_key as string);};
  const prior=replay();if(prior)return this.#checkedResult(b,prior);const window=this.briefWindow();if(!window.due||window.key!==input.windowKey)throw new StoreError('notification_window_not_due','当前不是该工作日简报窗口。',409);
  const existing=this.#check(input.windowKey);if(existing){const result=await this.#checkedResult(b,existing);this.#store.withTransaction(()=>{this.#current(b);replay();if(result.notice&&result.notice.refs.some(ref=>!this.#eligible(this.#required(ref))))throw new StoreError('notification_stale','原简报的当前资格已变化。',409);this.#store.connection.prepare('INSERT OR IGNORE INTO notification_brief_requests VALUES (?,?,?,?)').run(this.#namespace,input.requestId,hash,input.windowKey);});return result;}
  const refs=this.#briefRefs();for(const ref of refs)await this.read(b,ref);
  return this.#store.withTransaction(()=>{this.#current(b);const nowWindow=this.briefWindow();if(!nowWindow.due||nowWindow.key!==input.windowKey)throw new StoreError('notification_window_changed','简报核对期间偏好或工作日窗口已变化。',409);
   const checked=this.#check(input.windowKey);if(checked){replay();const notice=checked.noticeId?this.#notices().find(n=>n.id===checked.noticeId)??null:null;if(notice&&(digest(notice.refs)!==digest(refs)||notice.refs.some(ref=>!this.#eligible(this.#required(ref)))))throw new StoreError('notification_stale','同窗口简报在核对期间变化，请重新读取。',409);this.#store.connection.prepare('INSERT OR IGNORE INTO notification_brief_requests VALUES (?,?,?,?)').run(this.#namespace,input.requestId,hash,input.windowKey);return{check:checked,notice};}
   if(digest(refs)!==digest(this.#briefRefs()))throw new StoreError('notification_stale','汇总事项在提交前变化，请按当前事项重建简报。',409);
   const createdAt=this.#now();let notice:NotificationNotice|null=null;if(refs.length){notice={id:digest([this.#namespace,'brief',input.windowKey]),kind:'brief',createdAt,refs,receiver:{...this.#scope.owner},channel:'workbench',summary:input.summary,windowKey:input.windowKey};this.#store.connection.prepare('INSERT INTO notification_notices VALUES (?,?,?,?)').run(this.#namespace,notice.id,`brief:${input.windowKey}`,JSON.stringify(notice));}
   const check:BriefCheck={windowKey:input.windowKey,checkedAt:createdAt,status:notice?'published':'no_change',...(notice?{noticeId:notice.id}:{})};this.#store.connection.prepare('INSERT INTO notification_brief_checks VALUES (?,?,?)').run(this.#namespace,input.windowKey,JSON.stringify(check));this.#store.connection.prepare('INSERT INTO notification_brief_requests VALUES (?,?,?,?)').run(this.#namespace,input.requestId,hash,input.windowKey);return{check,notice};
  });
 }
 #commitNotice(b:RunBinding,input:{requestId:string;hash:string;key:string;notice:NotificationNotice}):NotificationNotice{
  return this.#store.withTransaction(()=>{this.#current(b);for(const ref of input.notice.refs)if(!this.#eligible(this.#required(ref)))throw new StoreError('notification_stale','站内显示前事项已有新版本或失去资格。',409);
   const prior=this.#store.connection.prepare('SELECT request_hash,notice_id FROM notification_delivery_requests WHERE namespace=? AND request_id=?').get(this.#namespace,input.requestId);if(prior&&prior.request_hash!==input.hash)throw new StoreError('notification_conflict','同一站内通知请求不能改写。',409);
   const row=this.#store.connection.prepare('SELECT value FROM notification_notices WHERE namespace=? AND dedup_key=?').get(this.#namespace,input.key);const value:NotificationNotice=row?JSON.parse(row.value as string):input.notice;
   if(prior&&prior.notice_id!==value.id)throw new StoreError('notification_conflict','站内通知请求与原回执不匹配。',409);
   if(!row)this.#store.connection.prepare('INSERT INTO notification_notices VALUES (?,?,?,?)').run(this.#namespace,value.id,input.key,JSON.stringify(value));
   if(!prior)this.#store.connection.prepare('INSERT INTO notification_delivery_requests VALUES (?,?,?,?)').run(this.#namespace,input.requestId,input.hash,value.id);
   if(value.refs.every(ref=>this.#eligible(this.#required(ref))))return structuredClone(value);
   const {summary:_summary,reason:_reason,...receipt}=value;return structuredClone(receipt);
  });
 }
 async immediate(inputBinding:RunBinding,raw:ImmediateNotification):Promise<NotificationNotice>{
  const b=this.#binding(inputBinding),p=object(raw,['id','revision','requestId']),ref={id:text(p.id,500),revision:integer(p.revision)},requestId=text(p.requestId,500);this.#current(b);const value=await this.read(b,ref);
  if(value.urgency!=='immediate'||!value.immediateReason)throw new StoreError('notification_not_immediate','此事项没有Agent给出的提前提醒理由。',409);
  const key=`immediate:${digest(ref)}`,notice:NotificationNotice={id:digest([this.#namespace,key]),kind:'immediate',createdAt:this.#now(),refs:[ref],receiver:{...this.#scope.owner},channel:'workbench',reason:value.immediateReason};return this.#commitNotice(b,{requestId,hash:digest(['immediate',ref]),key,notice});
 }
 async remind(inputBinding:RunBinding,raw:ReminderNotification):Promise<NotificationNotice>{
  const b=this.#binding(inputBinding),p=object(raw,['id','revision','decision','point','at','requestId','reason']),ref={id:text(p.id,500),revision:integer(p.revision)},decision=reference(p.decision),at=instant(p.at),requestId=text(p.requestId,500),reason=text(p.reason);
  if(!['remindAt','nextReviewAt','decideBy','executeBy'].includes(p.point as string))return invalid();const point=p.point as ReminderPoint;this.#current(b);const value=await this.read(b,ref);
  if(!value.decision||digest(value.decision)!==digest(decision)||!this.#o.verifyDecision)throw new StoreError('notification_decision_mismatch','提醒须关联此事项的准确待决版本。',409);
  const current=await this.#o.verifyDecision(b,decision);this.#current(b);
  if(current.id!==decision.id||current.revision!==decision.revision||current.qualification!=='current'||!['pending','deferred'].includes(current.status)||!current.window[point]||instant(current.window[point])!==at||at>this.#now())throw new StoreError('notification_point_not_due','提醒须使用当前待决事项已约定且已到达的准确时点。',409);
  const reminder={decision,point,at},key=`reminder:${digest(reminder)}`,notice:NotificationNotice={id:digest([this.#namespace,key]),kind:'reminder',createdAt:this.#now(),refs:[ref],receiver:{...this.#scope.owner},channel:'workbench',reason,reminder};
  return this.#commitNotice(b,{requestId,hash:digest(['reminder',ref,reminder,reason]),key,notice});
 }
 projection():NotificationProjection{
  this.#store.scope(this.#scope.owner,this.#scope.delegationId);const matters=this.history().filter(v=>this.#eligible(v)).map(v=>({...v,qualification:'current' as const})),byRef=new Map(matters.map(v=>[digest({id:v.id,revision:v.revision}),v]));const project=(n:NotificationNotice):ProjectedNotification=>{const refs=n.refs.map(r=>byRef.get(digest(r)));if(!refs.length||refs.some(v=>!v))return{id:n.id,kind:n.kind,createdAt:n.createdAt,refs:n.refs,qualification:'unavailable'};return{...n,qualification:'current',status:'published',matters:refs as NotificationRevision[]};};
  const notices=this.#notices().map(project),row=this.#store.connection.prepare('SELECT value FROM notification_brief_checks WHERE namespace=? ORDER BY rowid DESC LIMIT 1').get(this.#namespace);return{matters,briefs:notices.filter(n=>n.kind==='brief'),notices:notices.filter(n=>n.kind!=='brief'),checkState:row?JSON.parse(row.value as string):null};
 }
}
