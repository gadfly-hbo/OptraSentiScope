import type {SentiStore} from './store.ts';
import type {Owner} from './domain.ts';
import type {RunBinding} from '../runtime/index.ts';
import type {BriefPreferences} from './notifications.ts';
import type {ReminderPoint,DecisionReference} from './notifications.ts';
import type {ScheduleTiming} from '@deepseek-ai/dsh-schedule';
import {StoreError} from './domain.ts';
import {createHash} from 'node:crypto';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface NotificationTaskPlan {key:string;kind:'brief'|'decision';timing:ScheduleTiming;decision?:DecisionReference;point?:ReminderPoint;at?:string;}
export interface NotificationTask extends NotificationTaskPlan {
 id:string;binding:RunBinding;status:'pending'|'due'|'checked'|'superseded'|'closed';
 schedule:{status:'none'|'creating'|'active'|'stop_pending'|'stopped'|'unknown';id?:string;sessionId?:string;binding?:RunBinding};
 previousSchedules?:NotificationTask['schedule'][];check?:{requestId:string;reason:string;at:string};
}
function preferencesOf(value:BriefPreferences):BriefPreferences {
 if(!value||Object.keys(value).some(k=>!['timeZone','time','weekdays','revision'].includes(k))||typeof value.timeZone!=='string'||!(value.timeZone==='UTC'||value.timeZone.includes('/'))||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value.time)||!Array.isArray(value.weekdays)||!value.weekdays.length||value.weekdays.some(n=>!Number.isSafeInteger(n)||n<1||n>7)||new Set(value.weekdays).size!==value.weekdays.length)throw new StoreError('notification_preferences_invalid','简报偏好须为有效时区、本地时间和ISO星期。');
 try{new Intl.DateTimeFormat('en',{timeZone:value.timeZone}).format();}catch{throw new StoreError('notification_preferences_invalid','简报时区无效。');}
 return {timeZone:value.timeZone,time:value.time,weekdays:[...value.weekdays].sort()};
}

export class NotificationSchedules {
 readonly #store:SentiStore;readonly #scope:{owner:Owner;delegationId:string};readonly #namespace:string;
 readonly #options:{isCurrent(binding:RunBinding):boolean;defaults?:BriefPreferences;now?:()=>string};
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:{isCurrent(binding:RunBinding):boolean;defaults?:BriefPreferences;now?:()=>string}){
  store.scope(scope.owner,scope.delegationId);this.#store=store;this.#scope={owner:{...scope.owner},delegationId:scope.delegationId};this.#namespace=hash([scope.owner.enterpriseId,scope.owner.principalId,scope.delegationId]);this.#options=options;
  store.connection.exec('CREATE TABLE IF NOT EXISTS notification_preferences(namespace TEXT PRIMARY KEY,value TEXT NOT NULL)');
  store.connection.exec('CREATE TABLE IF NOT EXISTS notification_schedule_intents(namespace TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id))');
  if(!store.connection.prepare('SELECT 1 FROM notification_preferences WHERE namespace=?').get(this.#namespace)){
   const value={...preferencesOf(options.defaults??{timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,time:'17:00:00',weekdays:[1,2,3,4,5]}),revision:1};
   store.connection.prepare('INSERT OR IGNORE INTO notification_preferences VALUES (?,?)').run(this.#namespace,JSON.stringify(value));
  }
 }
 preferences():BriefPreferences{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return JSON.parse(this.#store.connection.prepare('SELECT value FROM notification_preferences WHERE namespace=?').get(this.#namespace)!.value as string);}
 #now(){return this.#options.now?.()??new Date().toISOString();}
 #binding(b:RunBinding):RunBinding{if(b?.owner?.enterpriseId!==this.#scope.owner.enterpriseId||b?.owner?.principalId!==this.#scope.owner.principalId||b?.delegationId!==this.#scope.delegationId||b.role!=='main'||!Number.isSafeInteger(b.generation)||b.generation<1||!Number.isSafeInteger(b.goalRevision)||b.goalRevision<1||!Number.isSafeInteger(b.epoch)||b.epoch<0)throw new StoreError('notification_schedule_scope','当前主会话没有调度资格。',409);return{owner:{enterpriseId:this.#scope.owner.enterpriseId,principalId:this.#scope.owner.principalId},delegationId:this.#scope.delegationId,goalRevision:b.goalRevision,epoch:b.epoch,generation:b.generation,role:'main'};}
 #current(b:RunBinding){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);if(d.lifecycle!=='active'||d.goalRevision!==b.goalRevision||!this.#options.isCurrent(b))throw new StoreError('notification_schedule_stale','当前通知调度资格已变化。',409);}
 #write(record:NotificationTask){this.#store.connection.prepare('INSERT INTO notification_schedule_intents VALUES (?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET value=excluded.value').run(this.#namespace,record.id,JSON.stringify(record));}
 list():NotificationTask[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM notification_schedule_intents WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(r=>JSON.parse(r.value as string));}
 get(id:string):NotificationTask{const record=this.list().find(x=>x.id===id);if(!record)throw new StoreError('notification_schedule_not_found','未找到当前委托的调度意图。',404);return record;}
 reconcile(raw:RunBinding,plans:readonly NotificationTaskPlan[]):NotificationTask[]{const b=this.#binding(raw);this.#current(b);return this.#store.withTransaction(()=>{
  const desired=new Map(plans.map(plan=>[hash([this.#namespace,b.goalRevision,b.epoch,plan.key]),structuredClone(plan)]));
  if(desired.size!==plans.length)throw new StoreError('notification_schedule_conflict','调度业务身份重复。',409);
  for(const record of this.list())if(!desired.has(record.id)&&['pending','due'].includes(record.status)){record.status='superseded';if(record.schedule.status==='active')record.schedule.status='stop_pending';else if(record.schedule.status==='creating')record.schedule.status='unknown';this.#write(record);}
  for(const [id,plan]of desired){const existing=this.list().find(x=>x.id===id);if(existing){if(hash({key:existing.key,kind:existing.kind,timing:existing.timing,decision:existing.decision,point:existing.point,at:existing.at})!==hash({key:plan.key,kind:plan.kind,timing:plan.timing,decision:plan.decision,point:plan.point,at:plan.at}))throw new StoreError('notification_schedule_conflict','已保存调度身份不能改写时间或关联。',409);continue;}
   this.#write({...plan,id,binding:b,status:'pending',schedule:{status:'none'}});
  }return this.list();
 });}
 due(raw:RunBinding):NotificationTask[]{const b=this.#binding(raw);this.#current(b);return this.#store.withTransaction(()=>{for(const r of this.list())if(r.binding.goalRevision===b.goalRevision&&r.binding.epoch===b.epoch&&r.kind==='decision'&&r.status==='pending'&&r.at&&r.at<=this.#now()){r.status='due';this.#write(r);}return this.list().filter(r=>r.binding.goalRevision===b.goalRevision&&r.binding.epoch===b.epoch&&r.status==='due');});}
 prepare(raw:RunBinding,id:string,sessionId:string):NotificationTask{const b=this.#binding(raw);this.#current(b);if(this.#store.connection.isTransaction)throw new StoreError('notification_schedule_transaction','调度前须先提交业务事务。',409);return this.#store.withTransaction(()=>{const r=this.get(id);if(r.binding.goalRevision!==b.goalRevision||r.binding.epoch!==b.epoch||r.status!=='pending'||r.at&&r.at<=this.#now())throw new StoreError('notification_schedule_stale','通知安排已到期或失效。',409);if(!['none','stopped'].includes(r.schedule.status))throw new StoreError('notification_schedule_unknown','已派发或未知的调度不能重复创建。',409);if(r.schedule.id)r.previousSchedules=[...r.previousSchedules??[],r.schedule];r.schedule={status:'creating',sessionId,binding:b};this.#write(r);return r;});}
 unknown(id:string):void{this.#store.withTransaction(()=>{const r=this.get(id);if(!['creating','active','stop_pending','unknown'].includes(r.schedule.status))throw new StoreError('notification_schedule_state','没有已派发的调度。',409);r.schedule.status='unknown';this.#write(r);});}
 attach(raw:RunBinding,id:string,sessionId:string,scheduleId:string):NotificationTask{const b=this.#binding(raw);return this.#store.withTransaction(()=>{const r=this.get(id);if(r.schedule.sessionId!==sessionId||hash(r.schedule.binding)!==hash(b)||r.schedule.id&&r.schedule.id!==scheduleId)throw new StoreError('notification_schedule_conflict','原生回执不属于该派发。',409);if(r.schedule.id)return r;if(!['creating','unknown'].includes(r.schedule.status))throw new StoreError('notification_schedule_conflict','原生回执不属于已派发意图。',409);let current=false;try{this.#current(b);current=r.binding.goalRevision===b.goalRevision&&r.binding.epoch===b.epoch&&['pending','due'].includes(r.status)&&r.schedule.status==='creating';}catch{}r.schedule.id=scheduleId;r.schedule.status=current?'active':'stop_pending';if(!current&&['pending','due'].includes(r.status)){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);if(['ending','ended'].includes(d.lifecycle))r.status='closed';else if(d.goalRevision!==r.binding.goalRevision)r.status='superseded';}this.#write(r);return r;});}
 stopped(id:string):void{this.#store.withTransaction(()=>{const r=this.get(id);if(!r.schedule.id)throw new StoreError('notification_schedule_unknown','没有准确原生ID，不能确认停止。',409);r.schedule.status='stopped';this.#write(r);});}
 pause():NotificationTask[]{return this.#store.withTransaction(()=>{const ended=['ending','ended'].includes(this.#store.scope(this.#scope.owner,this.#scope.delegationId).lifecycle);for(const r of this.list()){if(ended&&['pending','due'].includes(r.status))r.status='closed';if(r.schedule.status==='active')r.schedule.status='stop_pending';else if(r.schedule.status==='creating')r.schedule.status='unknown';this.#write(r);}return this.list();});}
 check(raw:RunBinding,id:string,input:{requestId:string;reason:string}):NotificationTask{const b=this.#binding(raw);this.#current(b);return this.#store.withTransaction(()=>{const r=this.get(id);if(r.binding.goalRevision!==b.goalRevision||r.binding.epoch!==b.epoch)throw new StoreError('notification_schedule_stale','旧安排不能写入当前检查。',409);if(r.check){if(r.check.requestId!==input.requestId||r.check.reason!==input.reason)throw new StoreError('notification_schedule_conflict','检查事实不可改写。',409);return r;}if(r.kind!=='decision'||r.status!=='due'||!input.requestId?.trim()||!input.reason?.trim())throw new StoreError('notification_schedule_not_due','只有到期的窗口安排可以记录检查。',409);r.status='checked';r.check={...input,at:this.#now()};if(r.schedule.status==='active')r.schedule.status='stop_pending';this.#write(r);return r;});}
 configure(input:BriefPreferences,expectedRevision:number):BriefPreferences{const normalized=preferencesOf(input);return this.#store.withTransaction(()=>{const prior=this.preferences();if(prior.revision!==expectedRevision)throw new StoreError('notification_preferences_conflict','简报偏好已有新版本。',409);const next={...normalized,revision:expectedRevision+1};this.#store.connection.prepare('UPDATE notification_preferences SET value=? WHERE namespace=?').run(JSON.stringify(next),this.#namespace);return next;});}
}
