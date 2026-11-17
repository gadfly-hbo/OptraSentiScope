import {createHash,randomUUID} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {ArtifactReference,ArtifactRevision} from './artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

export type DecisionAction='adopt'|'partial'|'adjust'|'reject'|'defer';
export interface DecisionOption {id:string;label:string;scope:string;costs:string;risks:string;}
export interface DecisionWindow {remindAt?:string;decideBy?:string;executeBy?:string;basis:string;nextReviewAt:string;}
export interface SaveDecision {
 id?:string;expectedRevision:number;requestId:string;artifact:ArtifactReference;
 title:string;question:string;options:readonly DecisionOption[];
 recommendation:{optionId:string;reason:string};unknowns:readonly string[];
 nondecisionImpact:string;nextActions:readonly string[];window:DecisionWindow;reason:string;
}
export interface DecisionRevision extends Omit<SaveDecision,'id'|'expectedRevision'|'requestId'> {
 id:string;revision:number;createdAt:string;goalRevision:number;epoch:number;
 supersedes:{id:string;revision:number}|null;
}
export interface OperatorResponseInput {
 id:string;revision:number;artifact:ArtifactReference;requestId:string;
 action:'acknowledge'|'reply'|DecisionAction;text:string;optionId?:string;scope?:string;
}
export interface OperatorResponse extends OperatorResponseInput {
 responseId:string;actor:Owner;createdAt:string;state:'acknowledged'|'pending'|'held'|'chosen';
 interpretation?:{action:'acknowledge'|'clarify'|DecisionAction;reason:string;at:string;requestId:string;revalidationReason?:string};
}
export interface OperatorChoice {
 id:string;decisionId:string;revision:number;artifact:ArtifactReference;responseId:string;
 action:DecisionAction;optionId?:string;scope:string;text:string;actor:Owner;createdAt:string;
 source:'explicit'|'interpreted';revalidationReason?:string;
}
export interface InterpretResponse {
 responseId:string;requestId:string;action:'acknowledge'|'clarify'|DecisionAction;
 optionId?:string;scope?:string;reason:string;revalidationReason?:string;
}
export interface DecisionRecord extends DecisionRevision {
 status:'pending'|'deferred'|'chosen'|'superseded'|'closed';
 qualification:'current'|'historical';windowState:'open'|'expired';seenAt?:string;
 closureReason?:'delegation_ending'|'delegation_ended'|'decision_revised'|'goal_changed'|'source_qualification_changed'|'plan_superseded';
 responses:readonly OperatorResponse[];choices:readonly OperatorChoice[];
}
export interface DecisionOptions {
 isCurrent(binding:RunBinding):boolean;
 isArtifactCurrent(ref:ArtifactReference,qualification:{goalRevision:number;epoch:number}):boolean;
 verifyArtifact(binding:RunBinding,ref:ArtifactReference):Promise<ArtifactRevision>;
 currentEpoch():number;now?():string;
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid():never{throw new StoreError('decision_invalid','待决事项、选择范围或准确版本字段无效。');}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))return invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=12000):string{if(typeof value!=='string'||!value.trim()||value.length>max)return invalid();return value.trim();}
function integer(value:unknown,min=1):number{if(!Number.isSafeInteger(value)||Number(value)<min)return invalid();return Number(value);}
function strings(value:unknown):readonly string[]{if(!Array.isArray(value)||value.length>100)return invalid();return value.map(v=>text(v));}
function instant(value:unknown):string{
 const m=typeof value==='string'?/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value):null;if(!m)return invalid();
 const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||Number(m[4])>23||Number(m[5])>59||Number(m[6])>59||!Number.isFinite(Date.parse(value as string)))return invalid();return new Date(value as string).toISOString();
}
function artifact(value:unknown):ArtifactReference{const a=object(value,['artifactId','version']);return{artifactId:text(a.artifactId,500),version:integer(a.version)};}
function action(value:unknown):DecisionAction{if(!['adopt','partial','adjust','reject','defer'].includes(value as string))return invalid();return value as DecisionAction;}
function windowOf(value:unknown):DecisionWindow{
 const w=object(value,['remindAt','decideBy','executeBy','basis','nextReviewAt']);const out:DecisionWindow={basis:text(w.basis),nextReviewAt:instant(w.nextReviewAt),...(w.remindAt===undefined?{}:{remindAt:instant(w.remindAt)}),...(w.decideBy===undefined?{}:{decideBy:instant(w.decideBy)}),...(w.executeBy===undefined?{}:{executeBy:instant(w.executeBy)})};
 if((out.remindAt&&out.decideBy&&out.remindAt>out.decideBy)||(out.decideBy&&out.executeBy&&out.decideBy>out.executeBy)||(out.remindAt&&out.executeBy&&out.remindAt>out.executeBy))return invalid();return out;
}
function expired(window:DecisionWindow,now:string):boolean{const deadline=window.decideBy??window.executeBy;return Boolean(deadline&&deadline<=now);}
function saveInput(value:unknown):SaveDecision{
 const p=object(value,['id','expectedRevision','requestId','artifact','title','question','options','recommendation','unknowns','nondecisionImpact','nextActions','window','reason']);
 if(!Array.isArray(p.options)||p.options.length<1||p.options.length>50)return invalid();const options=p.options.map(value=>{const o=object(value,['id','label','scope','costs','risks']);return{id:text(o.id,200),label:text(o.label,500),scope:text(o.scope),costs:text(o.costs),risks:text(o.risks)};});
 if(new Set(options.map(o=>o.id)).size!==options.length)return invalid();const r=object(p.recommendation,['optionId','reason']);const recommendation={optionId:text(r.optionId,200),reason:text(r.reason)};if(!options.some(o=>o.id===recommendation.optionId))return invalid();
 const out:SaveDecision={...(p.id===undefined?{}:{id:text(p.id,500)}),expectedRevision:integer(p.expectedRevision,0),requestId:text(p.requestId,500),artifact:artifact(p.artifact),title:text(p.title,500),question:text(p.question),options,recommendation,unknowns:strings(p.unknowns),nondecisionImpact:text(p.nondecisionImpact),nextActions:strings(p.nextActions),window:windowOf(p.window),reason:text(p.reason)};if(JSON.stringify(out).length>262144)return invalid();return out;
}
function responseInput(value:unknown):OperatorResponseInput{
 const p=object(value,['id','revision','artifact','requestId','action','text','optionId','scope']);const a=p.action==='acknowledge'||p.action==='reply'?p.action:action(p.action);
 if((a==='acknowledge'||a==='reply')&&(p.optionId!==undefined||p.scope!==undefined))return invalid();
 return{id:text(p.id,500),revision:integer(p.revision),artifact:artifact(p.artifact),requestId:text(p.requestId,500),action:a,text:(text(p.text),p.text as string),...(p.optionId===undefined?{}:{optionId:text(p.optionId,200)}),...(p.scope===undefined?{}:{scope:text(p.scope)})};
}
function interpretationInput(value:unknown):InterpretResponse{
 const p=object(value,['responseId','requestId','action','optionId','scope','reason','revalidationReason']);const a=p.action==='acknowledge'||p.action==='clarify'?p.action:action(p.action);
 if((a==='acknowledge'||a==='clarify')&&(p.optionId!==undefined||p.scope!==undefined))return invalid();
 return{responseId:text(p.responseId,500),requestId:text(p.requestId,500),action:a,reason:text(p.reason),...(p.optionId===undefined?{}:{optionId:text(p.optionId,200)}),...(p.scope===undefined?{}:{scope:text(p.scope)}),...(p.revalidationReason===undefined?{}:{revalidationReason:text(p.revalidationReason)})};
}
/** SentiScope business choices only. No model, timer, Engine ticket, or business action authority. */
export class DecisionStore {
 readonly #store:SentiStore;readonly #scope:{owner:Owner;delegationId:string};readonly #options:DecisionOptions;readonly #namespace:string;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:DecisionOptions){
  store.scope(scope.owner,scope.delegationId);this.#store=store;this.#scope={owner:{...scope.owner},delegationId:scope.delegationId};this.#options=options;this.#namespace=digest([scope.owner.enterpriseId,scope.owner.principalId,scope.delegationId]);
  store.connection.exec(`CREATE TABLE IF NOT EXISTS decision_revisions(namespace TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id,revision));
   CREATE TABLE IF NOT EXISTS decision_requests(namespace TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(namespace,request_id));
   CREATE TABLE IF NOT EXISTS operator_responses(namespace TEXT NOT NULL,response_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,response_id),UNIQUE(namespace,request_id));
   CREATE TABLE IF NOT EXISTS operator_choices(namespace TEXT NOT NULL,id TEXT NOT NULL,response_id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id),UNIQUE(namespace,response_id));
   CREATE TABLE IF NOT EXISTS operator_interpretations(namespace TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response_id TEXT NOT NULL,PRIMARY KEY(namespace,request_id));`);
 }
 #now(){return instant(this.#options.now?.()??new Date().toISOString());}
 #binding(value:RunBinding):RunBinding{
  if(value?.owner?.enterpriseId!==this.#scope.owner.enterpriseId||value?.owner?.principalId!==this.#scope.owner.principalId||value.delegationId!==this.#scope.delegationId)throw new StoreError('decision_scope','待决事项不属于当前委托。',403);
  if(value.role!=='main'||!Number.isSafeInteger(value.goalRevision)||value.goalRevision<1||!Number.isSafeInteger(value.epoch)||value.epoch<0||!Number.isSafeInteger(value.generation)||value.generation<1)throw new StoreError('decision_role','只有当前主Agent可以发布或解释待决事项。',403);
  return{owner:{...this.#scope.owner},delegationId:this.#scope.delegationId,goalRevision:value.goalRevision,epoch:value.epoch,generation:value.generation,role:'main'};
 }
 #current(binding:RunBinding){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);let ok=false;try{ok=this.#options.isCurrent(binding)===true;}catch{}if(d.lifecycle!=='active'||d.goalRevision!==binding.goalRevision||binding.epoch!==this.#options.currentEpoch()||!ok)throw new StoreError('decision_unqualified','当前待决事项的运行资格已失效。',409);}
 #artifactCurrent(ref:ArtifactReference,q:{goalRevision:number;epoch:number}){try{return this.#options.isArtifactCurrent(ref,q)===true;}catch{return false;}}
 #revision(id:string,revision?:number):DecisionRevision|undefined{const row=revision===undefined?this.#store.connection.prepare('SELECT value FROM decision_revisions WHERE namespace=? AND id=? ORDER BY revision DESC LIMIT 1').get(this.#namespace,id):this.#store.connection.prepare('SELECT value FROM decision_revisions WHERE namespace=? AND id=? AND revision=?').get(this.#namespace,id,revision);return row?JSON.parse(row.value as string):undefined;}
 #required(id:string,revision?:number):DecisionRevision{const value=this.#revision(text(id,500),revision===undefined?undefined:integer(revision));if(!value)throw new StoreError('decision_not_found','未找到该待决事项的准确版本。',404);return value;}
 #eligible(value:DecisionRevision){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);return d.goalRevision===value.goalRevision&&this.#options.currentEpoch()===value.epoch&&this.#revision(value.id)?.revision===value.revision&&this.#artifactCurrent(value.artifact,value);}
 #responses(value:DecisionRevision):OperatorResponse[]{return this.#store.connection.prepare("SELECT value FROM operator_responses WHERE namespace=? AND value->>'$.id'=? AND value->>'$.revision'=? ORDER BY rowid").all(this.#namespace,value.id,value.revision).map(r=>JSON.parse(r.value as string));}
 choices():OperatorChoice[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM operator_choices WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(r=>JSON.parse(r.value as string));}
 #view(value:DecisionRevision):DecisionRecord{
  const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId),current=this.#eligible(value),responses=this.#responses(value),choices=this.choices().filter(c=>c.decisionId===value.id&&c.revision===value.revision),last=choices.at(-1);
  const unresolved=!last||last.action==='defer';const status:DecisionRecord['status']=unresolved&&['ending','ended'].includes(d.lifecycle)?'closed':!current?'superseded':last?(last.action==='defer'?'deferred':'chosen'):'pending';
  const closureReason:DecisionRecord['closureReason']=status==='closed'?(d.lifecycle==='ended'?'delegation_ended':'delegation_ending'):!current?(this.#revision(value.id)?.revision!==value.revision?'decision_revised':d.goalRevision!==value.goalRevision?'goal_changed':this.#options.currentEpoch()!==value.epoch?'source_qualification_changed':'plan_superseded'):undefined;
  const acknowledged=responses.filter(r=>r.state==='acknowledged');return{...structuredClone(value),status,...(closureReason?{closureReason}:{}),qualification:current?'current':'historical',windowState:expired(value.window,this.#now())?'expired':'open',...(acknowledged.length?{seenAt:acknowledged[0].createdAt}:{}),responses,choices};
 }
 get(id:string,revision?:number):DecisionRecord|undefined{this.#store.scope(this.#scope.owner,this.#scope.delegationId);const value=this.#revision(text(id,500),revision===undefined?undefined:integer(revision));return value?this.#view(value):undefined;}
 list():DecisionRecord[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM decision_revisions WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(row=>this.#view(JSON.parse(row.value as string)));}
 reconcile():DecisionRecord[]{return this.list();}
 listCurrent(inputBinding:RunBinding){const binding=this.#binding(inputBinding);this.#current(binding);return this.list().filter(r=>r.qualification==='current').map(r=>({id:r.id,revision:r.revision,artifact:r.artifact,createdAt:r.createdAt,goalRevision:r.goalRevision,epoch:r.epoch,status:r.status,windowState:r.windowState,responseIds:r.responses.map(p=>p.responseId),choiceIds:r.choices.map(c=>c.id)}));}
 async #verify(binding:RunBinding,value:DecisionRevision):Promise<void>{
  if(this.#store.connection.isTransaction)throw new StoreError('decision_transaction','准确方案核对须在业务事务之外完成。',409);
  let result:ArtifactRevision;try{result=await this.#options.verifyArtifact(binding,structuredClone(value.artifact));}catch{throw new StoreError('decision_artifact_unavailable','待决事项的准确方案当前不可读取。',409);}this.#current(binding);
  if(result.kind!=='plan'||result.artifactId!==value.artifact.artifactId||result.version!==value.artifact.version||!this.#eligible(value))throw new StoreError('decision_stale','待决事项或关联方案的当前版本已变化。',409);
 }
 async read(inputBinding:RunBinding,ref:{id:string;revision:number}):Promise<DecisionRecord>{const binding=this.#binding(inputBinding);this.#current(binding);const value=this.#required(text(ref.id,500),integer(ref.revision));if(value.goalRevision!==binding.goalRevision||value.epoch!==binding.epoch)throw new StoreError('decision_stale','历史待决内容须按当前资格重新建立。',409);await this.#verify(binding,value);return this.#view(value);}
 async context(binding:RunBinding):Promise<readonly DecisionRecord[]>{const refs=this.listCurrent(binding);const values:DecisionRecord[]=[];for(const ref of refs)values.push(await this.read(binding,ref));return values;}
 async save(inputBinding:RunBinding,raw:SaveDecision):Promise<DecisionRecord>{
  const binding=this.#binding(inputBinding),input=saveInput(raw),hash=digest([input,binding.goalRevision,binding.epoch]);
  const replay=()=>{const prior=this.#store.connection.prepare('SELECT request_hash,id,revision FROM decision_requests WHERE namespace=? AND request_id=?').get(this.#namespace,input.requestId);if(!prior)return undefined;if(prior.request_hash!==hash)throw new StoreError('decision_conflict','同一待决请求身份不能改写内容。',409);return this.#view(this.#required(prior.id as string,prior.revision as number));};this.#current(binding);const prior=replay();if(prior){await this.#verify(binding,prior);return this.#view(prior);}
  if(!this.#artifactCurrent(input.artifact,binding))throw new StoreError('decision_stale','待决事项须关联当前准确方案版本。',409);
  if(this.#store.connection.isTransaction)throw new StoreError('decision_transaction','准确方案核对须在业务事务之外完成。',409);
  let checked:ArtifactRevision;try{checked=await this.#options.verifyArtifact(binding,structuredClone(input.artifact));}catch{throw new StoreError('decision_artifact_unavailable','待决事项的准确方案当前不可读取。',409);}this.#current(binding);
  if(checked.kind!=='plan'||checked.artifactId!==input.artifact.artifactId||checked.version!==input.artifact.version)return invalid();
  return this.#store.withTransaction(()=>{this.#current(binding);const replayed=replay();if(replayed){if(!this.#eligible(replayed))throw new StoreError('decision_stale','原请求已成为历史，不能读回旧正文。',409);return replayed;}if(!this.#artifactCurrent(input.artifact,binding))throw new StoreError('decision_stale','核对期间方案版本或资料资格已变化。',409);
   const id=input.id??randomUUID(),previous=this.#revision(id);if(input.expectedRevision!==(previous?.revision??0)||(!input.id&&input.expectedRevision!==0))throw new StoreError('decision_conflict','待决事项已有新版本，请准确修订。',409);
   const now=this.#now();if(input.window.nextReviewAt<=now||(input.window.decideBy&&input.window.decideBy<=now)||(input.window.executeBy&&input.window.executeBy<=now))throw new StoreError('decision_invalid','新待决事项的复查及有效窗口须在未来。');
   const {id:_id,expectedRevision:_expected,requestId:_request,...body}=input;const value:DecisionRevision={...body,id,revision:(previous?.revision??0)+1,createdAt:now,goalRevision:binding.goalRevision,epoch:binding.epoch,supersedes:previous?{id,revision:previous.revision}:null};
   this.#store.connection.prepare('INSERT INTO decision_revisions VALUES (?,?,?,?)').run(this.#namespace,id,value.revision,JSON.stringify(value));this.#store.connection.prepare('INSERT INTO decision_requests VALUES (?,?,?,?,?)').run(this.#namespace,input.requestId,hash,id,value.revision);return this.#view(value);
  });
 }
 #selection(value:DecisionRevision,a:DecisionAction,optionId?:string,scope?:string):{optionId?:string;scope:string}{
  const option=optionId===undefined?undefined:value.options.find(o=>o.id===optionId);if(optionId!==undefined&&!option)return invalid();if((a==='adopt'||a==='partial')&&!option)return invalid();
  if(a==='adopt'){if(scope!==undefined&&scope!==option!.scope)return invalid();return{optionId:option!.id,scope:option!.scope};}
  if(a==='partial'||a==='adjust')return{...(option?{optionId:option.id}:{}),scope:text(scope)};
  return{...(option?{optionId:option.id}:{}),scope:scope??option?.scope??'仅此待决事项'};
 }
 #choice(response:OperatorResponse,value:DecisionRevision,a:DecisionAction,selection:{optionId?:string;scope:string},source:OperatorChoice['source'],revalidationReason?:string):OperatorChoice{
  const choice:OperatorChoice={id:randomUUID(),decisionId:value.id,revision:value.revision,artifact:structuredClone(value.artifact),responseId:response.responseId,action:a,...selection,text:response.text,actor:{...this.#scope.owner},createdAt:this.#now(),source,...(revalidationReason?{revalidationReason}:{})};
  this.#store.connection.prepare('INSERT INTO operator_choices VALUES (?,?,?,?)').run(this.#namespace,choice.id,response.responseId,JSON.stringify(choice));return choice;
 }
 #writeResponse(response:OperatorResponse){this.#store.connection.prepare('UPDATE operator_responses SET value=? WHERE namespace=? AND response_id=?').run(JSON.stringify(response),this.#namespace,response.responseId);}
 respond(raw:OperatorResponseInput):OperatorResponse{
  const input=responseInput(raw),hash=digest(input);return this.#store.withTransaction(()=>{
   const existing=this.#store.connection.prepare('SELECT request_hash,value FROM operator_responses WHERE namespace=? AND request_id=?').get(this.#namespace,input.requestId);if(existing){if(existing.request_hash!==hash)throw new StoreError('decision_conflict','同一经营者回应请求不能改写内容。',409);return JSON.parse(existing.value as string);}
   const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId),value=this.#required(input.id,input.revision);
   if(d.lifecycle==='ended'||d.lifecycle==='ending')throw new StoreError('decision_closed','委托已结束或正在结束，不能产生新的经营选择。',409);
   if(digest(value.artifact)!==digest(input.artifact)||!this.#eligible(value))throw new StoreError('decision_stale','页面、待决事项或方案版本已变化，请核对当前事项。',409);
   const a=input.action;const selection=a==='acknowledge'||a==='reply'?undefined:this.#selection(value,a,input.optionId,input.scope);
   const held=d.lifecycle!=='active'||expired(value.window,this.#now());const state:OperatorResponse['state']=a==='acknowledge'?'acknowledged':held?'held':a==='reply'?'pending':'chosen';
   const response:OperatorResponse={...input,responseId:randomUUID(),actor:{...this.#scope.owner},createdAt:this.#now(),state};
   this.#store.connection.prepare('INSERT INTO operator_responses VALUES (?,?,?,?,?)').run(this.#namespace,response.responseId,input.requestId,hash,JSON.stringify(response));if(selection&&state==='chosen')this.#choice(response,value,a as DecisionAction,selection,'explicit');return structuredClone(response);
  });
 }
 async interpret(inputBinding:RunBinding,raw:InterpretResponse):Promise<OperatorResponse>{
  const binding=this.#binding(inputBinding),input=interpretationInput(raw),hash=digest(input);
  const responseOf=()=>{const row=this.#store.connection.prepare('SELECT value FROM operator_responses WHERE namespace=? AND response_id=?').get(this.#namespace,input.responseId);if(!row)throw new StoreError('decision_response_not_found','未找到当前委托内的经营者原始回应。',404);return JSON.parse(row.value as string) as OperatorResponse;};
  const replay=()=>{const prior=this.#store.connection.prepare('SELECT request_hash,response_id FROM operator_interpretations WHERE namespace=? AND request_id=?').get(this.#namespace,input.requestId);if(!prior)return undefined;if(prior.request_hash!==hash||prior.response_id!==input.responseId)throw new StoreError('decision_conflict','同一回应解释请求不能改写。',409);return responseOf();};this.#current(binding);const previous=replay();if(previous){await this.#verify(binding,this.#required(previous.id,previous.revision));return responseOf();}
  const response=responseOf(),value=this.#required(response.id,response.revision);await this.#verify(binding,value);
  return this.#store.withTransaction(()=>{this.#current(binding);if(!this.#eligible(value))throw new StoreError('decision_stale','待决事项当前资格已变化。',409);const prior=replay();if(prior)return prior;if(!this.#eligible(value))throw new StoreError('decision_stale','待决事项当前资格已变化。',409);const current=responseOf();
   if(current.interpretation)throw new StoreError('decision_response_interpreted','该回应已经解释，不能改写原选择或扩大范围。',409);
   if(current.action==='acknowledge'&&input.action!=='acknowledge')throw new StoreError('decision_acknowledgement_only','已读事实不能升级为方案采纳。',409);
   const typed=current.action!=='reply'&&current.action!=='acknowledge';let selection:{optionId?:string;scope:string}|undefined;
   if(input.action!=='acknowledge'&&input.action!=='clarify')selection=this.#selection(value,input.action,input.optionId,input.scope);
   if(typed){if(input.action!==current.action||!selection||digest(selection)!==digest(this.#selection(value,current.action as DecisionAction,current.optionId,current.scope)))throw new StoreError('decision_response_scope','明确的经营者动作与选择范围不能由Agent改写。',409);}
   if(selection&&(current.state==='held'||expired(value.window,this.#now()))&&!input.revalidationReason)throw new StoreError('decision_revalidation_required','窗口已过或回应曾被保留，须先明确核对方案当前适用性。',409);
   const existingChoice=this.#store.connection.prepare('SELECT id FROM operator_choices WHERE namespace=? AND response_id=?').get(this.#namespace,current.responseId);
   if(selection&&!existingChoice)this.#choice(current,value,input.action as DecisionAction,selection,current.action==='reply'?'interpreted':'explicit',input.revalidationReason);
   current.state=input.action==='acknowledge'?'acknowledged':input.action==='clarify'?'pending':'chosen';current.interpretation={action:input.action,reason:input.reason,at:this.#now(),requestId:input.requestId,...(input.revalidationReason?{revalidationReason:input.revalidationReason}:{})};this.#writeResponse(current);
   this.#store.connection.prepare('INSERT INTO operator_interpretations VALUES (?,?,?,?)').run(this.#namespace,input.requestId,hash,input.responseId);return structuredClone(current);
  });
 }
}
