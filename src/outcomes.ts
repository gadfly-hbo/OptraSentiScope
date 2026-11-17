import {createHash,randomUUID} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {ArtifactEvidence,ArtifactReference,ArtifactRevision} from './artifacts.ts';
import type {OperatorChoice} from './decisions.ts';
import type {RunBinding} from '../runtime/index.ts';

export interface OutcomeReference {kind:'execution'|'observation';id:string;revision:number;}
export interface ExecutionReference {id:string;revision:number;}
export interface OutcomeChoice {id:string;decisionId:string;revision:number;action:OperatorChoice['action'];scope:string;createdAt:string;}
export interface OutcomeStatement {kind:'operator_statement';messageId:string;text:string;createdAt:string;}
interface SaveOutcomeCommon {id?:string;expectedRevision:number;requestId:string;artifact:ArtifactReference;choiceId:string;scope:string;evidence:readonly ArtifactEvidence[];statementIds:readonly string[];unknowns:readonly string[];reason:string;}
export interface SaveExecution extends SaveOutcomeCommon {status:'not_started'|'partial'|'completed'|'unknown';asOf:string;startedAt?:string;endedAt?:string;extent:string;}
export interface SaveObservation extends SaveOutcomeCommon {execution:ExecutionReference;period:{from:string;to:string;};observedAt:string;maturity:'mature'|'immature'|'missing_data';baseline:string;measure:string;result:string;comparability:string;gaps:readonly string[];}
interface OutcomeRevisionCommon {id:string;revision:number;createdAt:string;goalRevision:number;epoch:number;choice:OutcomeChoice;statements:readonly OutcomeStatement[];supersedes:ExecutionReference|null;}
export interface ExecutionRevision extends Omit<SaveExecution,'id'|'expectedRevision'|'requestId'>,OutcomeRevisionCommon {kind:'execution';}
export interface ObservationRevision extends Omit<SaveObservation,'id'|'expectedRevision'|'requestId'>,OutcomeRevisionCommon {kind:'observation';}
export type OutcomeRevision=ExecutionRevision|ObservationRevision;
export interface OutcomeMetadata extends OutcomeReference {artifact:ArtifactReference;choiceId:string;createdAt:string;goalRevision:number;epoch:number;latest:boolean;}
export type ProjectedOutcome<T extends OutcomeRevision>=(T&{qualification:'current';latest:boolean;})|(OutcomeMetadata&{qualification:'unavailable';});
export interface OutcomeProjection {executions:readonly ProjectedOutcome<ExecutionRevision>[];observations:readonly ProjectedOutcome<ObservationRevision>[];}
export interface OutcomeOptions {
 isCurrent(binding:RunBinding):boolean;currentEpoch():number;
 isArtifactEligible(ref:ArtifactReference,q:{goalRevision:number;epoch:number}):boolean;
 verifyArtifact(binding:RunBinding,ref:ArtifactReference):Promise<ArtifactRevision>;
 verifyEvidence(binding:RunBinding,evidence:readonly ArtifactEvidence[]):Promise<void>;
 getChoice(choiceId:string):OperatorChoice|undefined;now?():string;
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid():never{throw new StoreError('outcome_invalid','执行事实、观察字段或准确引用无效。');}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))return invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=20000):string{if(typeof value!=='string'||!value.trim()||value.length>max)return invalid();return value;}
function integer(value:unknown,min=1):number{if(!Number.isSafeInteger(value)||Number(value)<min)return invalid();return Number(value);}
function strings(value:unknown):readonly string[]{if(!Array.isArray(value)||value.length>100)return invalid();return value.map(v=>text(v));}
function instant(value:unknown):string{
 const m=typeof value==='string'?/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value):null;if(!m)return invalid();
 const y=+m[1],month=+m[2],day=+m[3],days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||+m[4]>23||+m[5]>59||+m[6]>59||!Number.isFinite(Date.parse(value as string)))return invalid();return new Date(value as string).toISOString();
}
function artifact(value:unknown):ArtifactReference{const r=object(value,['artifactId','version']);return{artifactId:text(r.artifactId,500),version:integer(r.version)};}
function reference(value:unknown):ExecutionReference{const r=object(value,['id','revision']);return{id:text(r.id,500),revision:integer(r.revision)};}
function common(value:unknown,extra:readonly string[]):SaveOutcomeCommon&Record<string,unknown>{
 const p=object(value,['id','expectedRevision','requestId','artifact','choiceId','scope','evidence','statementIds','unknowns','reason',...extra]);
 if(!Array.isArray(p.evidence)||p.evidence.length>100)return invalid();const evidence=p.evidence.map(v=>{const r=object(v,['ref','hash']),hash=text(r.hash,64);if(!/^[0-9a-f]{64}$/.test(hash))return invalid();return{ref:text(r.ref,4096),hash};});
 const statementIds=strings(p.statementIds);if(new Set(statementIds).size!==statementIds.length||statementIds.some(id=>id.length>500))return invalid();
 const input:SaveOutcomeCommon&Record<string,unknown>={...(p.id===undefined?{}:{id:text(p.id,500)}),expectedRevision:integer(p.expectedRevision,0),requestId:text(p.requestId,500),artifact:artifact(p.artifact),choiceId:text(p.choiceId,500),scope:text(p.scope),evidence,statementIds,unknowns:strings(p.unknowns),reason:text(p.reason)};
 for(const key of extra)if(p[key]!==undefined)input[key]=p[key];
 if(JSON.stringify(input).length>262144)return invalid();return input as SaveOutcomeCommon&Record<string,unknown>;
}
function executionInput(value:unknown):SaveExecution{
 const p=common(value,['status','asOf','startedAt','endedAt','extent']);if(!['not_started','partial','completed','unknown'].includes(p.status as string))return invalid();
 return{...p,status:p.status as SaveExecution['status'],asOf:instant(p.asOf),...(p.startedAt===undefined?{}:{startedAt:instant(p.startedAt)}),...(p.endedAt===undefined?{}:{endedAt:instant(p.endedAt)}),extent:text(p.extent)};
}
function observationInput(value:unknown):SaveObservation{
 const p=common(value,['execution','period','observedAt','maturity','baseline','measure','result','comparability','gaps']),period=object(p.period,['from','to']);if(!['mature','immature','missing_data'].includes(p.maturity as string))return invalid();
 return{...p,execution:reference(p.execution),period:{from:instant(period.from),to:instant(period.to)},observedAt:instant(p.observedAt),maturity:p.maturity as SaveObservation['maturity'],baseline:text(p.baseline),measure:text(p.measure),result:text(p.result),comparability:text(p.comparability),gaps:strings(p.gaps)};
}
/** Immutable actual-result facts only; never performs an operating action, infers adoption, or attributes effects. */
export class OutcomeStore {
 readonly #store:SentiStore;readonly #scope:{owner:Owner;delegationId:string};readonly #o:OutcomeOptions;readonly #namespace:string;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:OutcomeOptions){
  store.scope(scope.owner,scope.delegationId);this.#store=store;this.#scope={owner:{enterpriseId:scope.owner.enterpriseId,principalId:scope.owner.principalId},delegationId:scope.delegationId};this.#o=options;this.#namespace=digest([scope.owner.enterpriseId,scope.owner.principalId,scope.delegationId]);
  store.connection.exec(`CREATE TABLE IF NOT EXISTS outcome_revisions(namespace TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,kind,id,revision));
   CREATE TABLE IF NOT EXISTS outcome_requests(namespace TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(namespace,request_id));
   CREATE TABLE IF NOT EXISTS outcome_qualification_checks(namespace TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,goal_revision INTEGER NOT NULL,epoch INTEGER NOT NULL,status TEXT NOT NULL,checked_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS outcome_qualification_lookup ON outcome_qualification_checks(namespace,kind,id,revision,goal_revision,epoch);`);
 }
 #now(){return instant(this.#o.now?.()??new Date().toISOString());}
 #binding(value:RunBinding):RunBinding{
  if(value?.owner?.enterpriseId!==this.#scope.owner.enterpriseId||value?.owner?.principalId!==this.#scope.owner.principalId||value.delegationId!==this.#scope.delegationId)throw new StoreError('outcome_scope','结果事实不属于当前委托。',403);
  if(value.role!=='main'||!Number.isSafeInteger(value.goalRevision)||value.goalRevision<1||!Number.isSafeInteger(value.epoch)||value.epoch<0||!Number.isSafeInteger(value.generation)||value.generation<1)throw new StoreError('outcome_role','只有当前主Agent可以记录或读取结果事实。',403);
  return{owner:{...this.#scope.owner},delegationId:this.#scope.delegationId,goalRevision:value.goalRevision,epoch:value.epoch,generation:value.generation,role:'main'};
 }
 #current(b:RunBinding){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);let current=false;try{current=this.#o.isCurrent(b)===true;}catch{}if(d.lifecycle!=='active'||d.goalRevision!==b.goalRevision||this.#o.currentEpoch()!==b.epoch||!current)throw new StoreError('outcome_unqualified','结果事实的当前运行资格已失效。',409);}
 #choice(choiceId:string,ref:ArtifactReference):OutcomeChoice{
  let choice:OperatorChoice|undefined;try{choice=this.#o.getChoice(choiceId);}catch{}
  if(!choice||choice.id!==choiceId||choice.actor.enterpriseId!==this.#scope.owner.enterpriseId||choice.actor.principalId!==this.#scope.owner.principalId||digest(choice.artifact)!==digest(ref))throw new StoreError('outcome_choice_mismatch','结果须关联本委托真实选择及其准确方案版本。',409);
  return{id:choice.id,decisionId:choice.decisionId,revision:choice.revision,action:choice.action,scope:choice.scope,createdAt:choice.createdAt};
 }
 #statements(ids:readonly string[]):OutcomeStatement[]{const messages=this.#store.get(this.#scope.owner,this.#scope.delegationId).messages;return ids.map(messageId=>{const m=messages.find(v=>v.id===messageId);if(!m)throw new StoreError('outcome_statement_not_found','未找到本委托保存的负责人原始陈述。',404);return{kind:'operator_statement',messageId,text:m.text,createdAt:m.createdAt};});}
 #revision(kind:OutcomeReference['kind'],id:string,revision?:number):OutcomeRevision|undefined{const row=revision===undefined?this.#store.connection.prepare('SELECT value FROM outcome_revisions WHERE namespace=? AND kind=? AND id=? ORDER BY revision DESC LIMIT 1').get(this.#namespace,kind,id):this.#store.connection.prepare('SELECT value FROM outcome_revisions WHERE namespace=? AND kind=? AND id=? AND revision=?').get(this.#namespace,kind,id,revision);return row?JSON.parse(row.value as string):undefined;}
 #required(kind:OutcomeReference['kind'],ref:ExecutionReference):OutcomeRevision{const v=this.#revision(kind,ref.id,ref.revision);if(!v)throw new StoreError('outcome_not_found','未找到结果事实的准确修订。',404);return v;}
 #basis(input:Pick<SaveOutcomeCommon,'artifact'|'choiceId'|'statementIds'>,q:{goalRevision:number;epoch:number},choice:OutcomeChoice,statements:readonly OutcomeStatement[]):boolean{
  try{return this.#o.isArtifactEligible(input.artifact,q)===true&&digest(this.#choice(input.choiceId,input.artifact))===digest(choice)&&digest(this.#statements(input.statementIds))===digest(statements);}catch{return false;}
 }
 #eligible(value:OutcomeRevision):boolean{
  try{const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId),epoch=this.#o.currentEpoch(),receipt=this.#store.connection.prepare('SELECT status FROM outcome_qualification_checks WHERE namespace=? AND kind=? AND id=? AND revision=? AND goal_revision=? AND epoch=? ORDER BY rowid DESC LIMIT 1').get(this.#namespace,value.kind,value.id,value.revision,d.goalRevision,epoch);return !['ending','ended'].includes(d.lifecycle)&&d.goalRevision===value.goalRevision&&receipt?.status==='qualified'&&this.#basis(value,{goalRevision:d.goalRevision,epoch},value.choice,value.statements)&&(value.kind!=='observation'||this.#executionAssociation(value,value.goalRevision,true));}catch{return false;}
 }
 #mark(b:RunBinding,value:OutcomeRevision,status:'qualified'|'unavailable'){this.#store.connection.prepare('INSERT INTO outcome_qualification_checks VALUES (?,?,?,?,?,?,?,?)').run(this.#namespace,value.kind,value.id,value.revision,b.goalRevision,b.epoch,status,this.#now());}
 #metadata(value:OutcomeRevision):OutcomeMetadata{return{kind:value.kind,id:value.id,revision:value.revision,artifact:structuredClone(value.artifact),choiceId:value.choiceId,createdAt:value.createdAt,goalRevision:value.goalRevision,epoch:value.epoch,latest:this.#revision(value.kind,value.id)?.revision===value.revision};}
 history():OutcomeRevision[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM outcome_revisions WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(row=>JSON.parse(row.value as string));}
 meta(inputBinding:RunBinding):(OutcomeMetadata&{qualification:'current'|'unavailable'})[]{const b=this.#binding(inputBinding);this.#current(b);return this.history().filter(v=>v.goalRevision===b.goalRevision).map(v=>({...this.#metadata(v),qualification:this.#eligible(v)?'current':'unavailable'}));}
 isCurrentReference(inputBinding:RunBinding,raw:OutcomeReference,ref?:ArtifactReference,executionContext?:ExecutionReference):boolean{try{const b=this.#binding(inputBinding);this.#current(b);const p=object(raw,['kind','id','revision']);if(!['execution','observation'].includes(p.kind as string))return false;const value=this.#required(p.kind as OutcomeReference['kind'],{id:text(p.id,500),revision:integer(p.revision)});if(value.kind==='observation'){const context=executionContext?reference(executionContext):value.execution,latest=this.#revision('execution',value.execution.id);if(context.id!==value.execution.id||latest?.revision!==context.revision||!this.#eligible(latest))return false;}return this.#eligible(value)&&this.#revision(value.kind,value.id)?.revision===value.revision&&(!ref||digest(value.artifact)===digest(artifact(ref)));}catch{return false;}}
 projection():OutcomeProjection{
  const project=(v:OutcomeRevision)=>this.#eligible(v)?{...v,qualification:'current' as const,latest:this.#revision(v.kind,v.id)?.revision===v.revision}:{...this.#metadata(v),qualification:'unavailable' as const};const values=this.history();return{executions:values.filter((v):v is ExecutionRevision=>v.kind==='execution').map(project) as ProjectedOutcome<ExecutionRevision>[],observations:values.filter((v):v is ObservationRevision=>v.kind==='observation').map(project) as ProjectedOutcome<ObservationRevision>[]};
 }
 async #verifyBody(b:RunBinding,input:Pick<SaveOutcomeCommon,'artifact'|'choiceId'|'evidence'|'statementIds'>,choice:OutcomeChoice,statements:readonly OutcomeStatement[]):Promise<void>{
  if(this.#store.connection.isTransaction)throw new StoreError('outcome_transaction','结果依据须在业务事务之外核对。',409);
  try{const a=await this.#o.verifyArtifact(b,structuredClone(input.artifact));this.#current(b);if(a.kind!=='plan'||a.artifactId!==input.artifact.artifactId||a.version!==input.artifact.version||a.goalRevision!==b.goalRevision)throw Error();await this.#o.verifyEvidence(b,structuredClone(input.evidence));this.#current(b);}catch(error){if(error instanceof StoreError&&error.code==='outcome_unqualified')throw error;throw new StoreError('outcome_evidence_unavailable','结果的准确方案或来源当前不可读取。',409);}
  if(!this.#basis(input,b,choice,statements))throw new StoreError('outcome_stale','核对期间结果关联或资格已变化。',409);
 }
 #executionAssociation(input:Pick<SaveObservation,'artifact'|'choiceId'|'execution'>,goalRevision:number,requireQualified:boolean):boolean{try{const execution=this.#required('execution',input.execution);return execution.goalRevision===goalRevision&&execution.choiceId===input.choiceId&&digest(execution.artifact)===digest(input.artifact)&&(!requireQualified||this.#eligible(execution));}catch{return false;}}
 async #verifyRecord(b:RunBinding,value:OutcomeRevision):Promise<void>{
  this.#current(b);if(value.goalRevision!==b.goalRevision)throw new StoreError('outcome_stale','不同目标版本的结果不能直接回放。',409);
  try{if(value.kind==='observation'){if(!this.#executionAssociation(value,b.goalRevision,false))throw new StoreError('outcome_execution_mismatch','观察须保留本选择和方案下的准确执行修订。',409);await this.#verifyRecord(b,this.#required('execution',value.execution));}
   await this.#verifyBody(b,value,value.choice,value.statements);this.#store.withTransaction(()=>{this.#current(b);if(!this.#basis(value,b,value.choice,value.statements)||(value.kind==='observation'&&!this.#executionAssociation(value,b.goalRevision,true)))throw new StoreError('outcome_stale','结果读回提交前关联资格已变化。',409);this.#mark(b,value,'qualified');});
  }catch(error){this.#mark(b,value,'unavailable');throw error;}
 }
 #request(requestId:string,hash:string):OutcomeRevision|undefined{
  const row=this.#store.connection.prepare('SELECT request_hash,kind,id,revision FROM outcome_requests WHERE namespace=? AND request_id=?').get(this.#namespace,requestId);if(!row)return undefined;
  if(row.request_hash!==hash)throw new StoreError('outcome_conflict','同一结果记录请求不能改写内容。',409);return this.#required(row.kind as OutcomeReference['kind'],{id:row.id as string,revision:row.revision as number});
 }
 #body(value:OutcomeRevision){const {kind:_kind,id:_id,revision:_revision,createdAt:_at,goalRevision:_goal,epoch:_epoch,choice:_choice,statements:_statements,supersedes:_supersedes,...body}=value;return body;}
 #provenance(kind:OutcomeReference['kind'],input:SaveExecution|SaveObservation){
  const hasSource=input.evidence.length>0||input.statementIds.length>0;
  if(kind==='execution'){const e=input as SaveExecution;if(e.status==='unknown'&&!e.unknowns.length)return invalid();if((e.status!=='unknown'||e.startedAt||e.endedAt)&&!hasSource)throw new StoreError('outcome_provenance_required','实际执行陈述须有获准资料或已保存负责人原话，缺记录请明确未知。',409);}
  else{const o=input as SaveObservation;if(o.maturity==='missing_data'&&!o.gaps.length)return invalid();if(o.maturity!=='missing_data'&&!hasSource)throw new StoreError('outcome_provenance_required','观察结果须有获准资料或已保存负责人原话，缺资料请明确记录。',409);}
 }
 #times(kind:OutcomeReference['kind'],input:SaveExecution|SaveObservation){
  const now=this.#now();if(kind==='execution'){const e=input as SaveExecution;if(e.asOf>now||(e.startedAt&&e.startedAt>e.asOf)||(e.endedAt&&e.endedAt>e.asOf)||(e.startedAt&&e.endedAt&&e.endedAt<e.startedAt)||(e.status==='not_started'&&(e.startedAt||e.endedAt)))return invalid();}
  else{const o=input as SaveObservation;if(o.period.from>o.period.to||o.period.to>o.observedAt||o.observedAt>now)return invalid();}
 }
 async #save(b:RunBinding,kind:OutcomeReference['kind'],input:SaveExecution|SaveObservation):Promise<OutcomeRevision>{
  this.#current(b);this.#provenance(kind,input);this.#times(kind,input);const hash=digest([kind,input,b.goalRevision,b.epoch]),prior=this.#request(input.requestId,hash);if(prior){await this.#verifyRecord(b,prior);return structuredClone(prior);}
  if(kind==='observation'){const observation=input as SaveObservation;if(!this.#executionAssociation(observation,b.goalRevision,false))throw new StoreError('outcome_execution_mismatch','观察须引用同一选择和准确方案的执行修订。',409);await this.#verifyRecord(b,this.#required('execution',observation.execution));}
  const choice=this.#choice(input.choiceId,input.artifact),statements=this.#statements(input.statementIds);await this.#verifyBody(b,input,choice,statements);
  return this.#store.withTransaction(()=>{
   this.#current(b);const replay=this.#request(input.requestId,hash);if(replay){if(!this.#eligible(replay))throw new StoreError('outcome_stale','原结果请求已失去当前资格。',409);return structuredClone(replay);}
   if(!this.#basis(input,b,choice,statements)||(kind==='observation'&&!this.#executionAssociation(input as SaveObservation,b.goalRevision,true)))throw new StoreError('outcome_stale','结果提交前准确关联或资格已变化。',409);
   const id=input.id??randomUUID(),previous=this.#revision(kind,id);if(input.expectedRevision!==(previous?.revision??0)||(!input.id&&input.expectedRevision!==0))throw new StoreError('outcome_conflict','结果事实已有新修订，请准确更新。',409);
   if(previous&&(previous.choiceId!==input.choiceId||digest(previous.artifact)!==digest(input.artifact)))throw new StoreError('outcome_association_changed','同一结果事项不能改挂其他选择或方案。',409);
   const {id:_id,expectedRevision:_expected,requestId:_request,...body}=input;
   const same=previous&&previous.goalRevision===b.goalRevision&&previous.epoch===b.epoch&&digest(this.#body(previous))===digest(body);
   const value:OutcomeRevision=same?previous:{...body,kind,id,revision:(previous?.revision??0)+1,createdAt:this.#now(),goalRevision:b.goalRevision,epoch:b.epoch,choice,statements,supersedes:previous?{id,revision:previous.revision}:null} as OutcomeRevision;
   if(!same)this.#store.connection.prepare('INSERT INTO outcome_revisions VALUES (?,?,?,?,?)').run(this.#namespace,kind,id,value.revision,JSON.stringify(value));this.#store.connection.prepare('INSERT INTO outcome_requests VALUES (?,?,?,?,?,?)').run(this.#namespace,input.requestId,hash,kind,id,value.revision);this.#mark(b,value,'qualified');return structuredClone(value);
  });
 }
 async saveExecution(inputBinding:RunBinding,raw:SaveExecution):Promise<ExecutionRevision>{return this.#save(this.#binding(inputBinding),'execution',executionInput(raw)) as Promise<ExecutionRevision>;}
 async readExecution(inputBinding:RunBinding,raw:ExecutionReference):Promise<ExecutionRevision>{const b=this.#binding(inputBinding);this.#current(b);const value=this.#required('execution',reference(raw)) as ExecutionRevision;await this.#verifyRecord(b,value);return structuredClone(value);}
 async saveObservation(inputBinding:RunBinding,raw:SaveObservation):Promise<ObservationRevision>{return this.#save(this.#binding(inputBinding),'observation',observationInput(raw)) as Promise<ObservationRevision>;}
 async readObservation(inputBinding:RunBinding,raw:ExecutionReference):Promise<ObservationRevision>{const b=this.#binding(inputBinding);this.#current(b);const value=this.#required('observation',reference(raw)) as ObservationRevision;await this.#verifyRecord(b,value);return structuredClone(value);}
}
