import {randomUUID,createHash} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {RunBinding} from '../runtime/index.ts';

export interface ArtifactEvidence {readonly ref:string;readonly hash:string;}
interface ArtifactCommon {
 readonly title:string;readonly summary:string;readonly evidence:readonly ArtifactEvidence[];
 readonly assumptions:readonly string[];readonly unknowns:readonly string[];
 readonly applicability:string;readonly invalidatedBy:readonly string[];
}
export interface ArtifactObservation {readonly baseline:string;readonly expectedChange:string;readonly measure:string;readonly window:string;readonly source:string;readonly check:string;}
export interface EffectAssessment {
 readonly plan:ArtifactReference;readonly choiceId:string;
 readonly execution:{readonly id:string;readonly revision:number};readonly observation:{readonly id:string;readonly revision:number};
 readonly scope:string;readonly evidenceConnection:string;readonly competingExplanations:readonly string[];readonly limitations:readonly string[];
}
export type ArtifactContent=(ArtifactCommon&{readonly kind:'judgment';readonly effect?:EffectAssessment})|(ArtifactCommon&{
 readonly kind:'plan';readonly recommendation:string;
 readonly alternatives:readonly {readonly option:string;readonly costs:string;readonly risks:string;}[];
 readonly constraints:readonly string[];readonly observation:ArtifactObservation;
});
export interface ArtifactReference {readonly artifactId:string;readonly version:number;}
export interface ArtifactRevision extends ArtifactReference {
 readonly kind:ArtifactContent['kind'];readonly content:ArtifactContent;readonly reason:string;
 readonly createdAt:string;readonly goalRevision:number;readonly epoch:number;
 readonly actor:{readonly role:RunBinding['role'];readonly assignmentId?:string;readonly generation:number;};
 readonly supersedes:ArtifactReference|null;
}
export interface SaveArtifact {readonly artifactId?:string;readonly expectedVersion:number;readonly requestId:string;readonly reason:string;readonly content:ArtifactContent;}
export interface ArtifactMetadata extends ArtifactReference {readonly kind:ArtifactContent['kind'];readonly createdAt:string;readonly goalRevision:number;readonly epoch:number;readonly qualification:'current'|'historical'|'unavailable';readonly effect?:true;}
export type ArtifactReassessment=
 |{status:'qualified';revision:ArtifactRevision;accessQualification:'current'|'historical';useQualification:'current'|'historical';reassessmentDue:true;checkedAt:string}
 |{status:'unavailable';artifactId:string;version:number;kind?:ArtifactContent['kind'];createdAt?:string;goalRevision?:number;epoch?:number;accessQualification:'unavailable';useQualification:'unavailable';reassessmentDue:true;restriction:string;unknowns:readonly string[];checkedAt:string};
export interface ArtifactOptions {
 isCurrent(binding:RunBinding):boolean;verifyEvidence(binding:RunBinding,evidence:readonly ArtifactEvidence[]):Promise<void>;now?:()=>string;
 verifyEffect?(binding:RunBinding,effect:EffectAssessment):Promise<void>;
 isEffectCurrent?(effect:EffectAssessment,q:{goalRevision:number;epoch:number}):boolean;currentEpoch?():number;
}

function invalid():never{throw new StoreError('artifact_invalid','成果字段或准确版本引用无效。');}
function object(value:unknown,allowed:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))return invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=20000):string{if(typeof value!=='string'||!value.trim()||value.length>max)return invalid();return value;}
function integer(value:unknown,min:number):number{if(!Number.isSafeInteger(value)||(value as number)<min)return invalid();return value as number;}
function strings(value:unknown):readonly string[]{if(!Array.isArray(value)||value.length>100)return invalid();return value.map(item=>text(item));}
function effectOf(value:unknown):EffectAssessment{
 const e=object(value,['plan','choiceId','execution','observation','scope','evidenceConnection','competingExplanations','limitations']);
 const plan=object(e.plan,['artifactId','version']);const ref=(value:unknown)=>{const r=object(value,['id','revision']);return{id:text(r.id,500),revision:integer(r.revision,1)};};
 return{plan:{artifactId:text(plan.artifactId,256),version:integer(plan.version,1)},choiceId:text(e.choiceId,500),execution:ref(e.execution),observation:ref(e.observation),scope:text(e.scope),evidenceConnection:text(e.evidenceConnection),competingExplanations:strings(e.competingExplanations),limitations:strings(e.limitations)};
}
function effectOfContent(content:ArtifactContent):EffectAssessment|undefined{return content.kind==='judgment'?content.effect:undefined;}
function contentOf(raw:unknown):ArtifactContent{
 const c=object(raw,['kind','title','summary','evidence','assumptions','unknowns','applicability','invalidatedBy','recommendation','alternatives','constraints','observation','effect']);
 if(c.kind!=='judgment'&&c.kind!=='plan')return invalid();
 if(!Array.isArray(c.evidence)||c.evidence.length>100)return invalid();
 const evidence=c.evidence.map(raw=>{const ref=object(raw,['ref','hash']);const hash=text(ref.hash,64);if(!/^[a-f0-9]{64}$/.test(hash))return invalid();return {ref:text(ref.ref,1024),hash};});
 const common={title:text(c.title,500),summary:text(c.summary),evidence,assumptions:strings(c.assumptions),unknowns:strings(c.unknowns),applicability:text(c.applicability),invalidatedBy:strings(c.invalidatedBy)};
 if(c.kind==='judgment'){if(['recommendation','alternatives','constraints','observation'].some(key=>c[key]!==undefined))return invalid();return {kind:'judgment',...common,...(c.effect===undefined?{}:{effect:effectOf(c.effect)})};}
 if(c.effect!==undefined)return invalid();
 if(!Array.isArray(c.alternatives)||c.alternatives.length<1||c.alternatives.length>100)return invalid();
 const alternatives=c.alternatives.map(raw=>{const item=object(raw,['option','costs','risks']);return {option:text(item.option),costs:text(item.costs),risks:text(item.risks)};});
 const o=object(c.observation,['baseline','expectedChange','measure','window','source','check']);
 return {kind:'plan',...common,recommendation:text(c.recommendation),alternatives,constraints:strings(c.constraints),observation:{baseline:text(o.baseline),expectedChange:text(o.expectedChange),measure:text(o.measure),window:text(o.window),source:text(o.source),check:text(o.check)}};
}
function referenceOf(raw:unknown):ArtifactReference{if(!raw||typeof raw!=='object'||Array.isArray(raw))return invalid();const ref=raw as Record<string,unknown>;return {artifactId:text(ref.artifactId,256),version:integer(ref.version,1)};}
function inputOf(raw:unknown):SaveArtifact{const input=object(raw,['artifactId','expectedVersion','requestId','reason','content']);const content=contentOf(input.content);if(JSON.stringify(content).length>262144)return invalid();return {...(input.artifactId===undefined?{}:{artifactId:text(input.artifactId,256)}),expectedVersion:integer(input.expectedVersion,0),requestId:text(input.requestId,256),reason:text(input.reason),content};}

/** Business revisions only; never creates an Agent, ticket, Schedule, or model call. */
export class ArtifactStore {
 readonly #store:SentiStore;readonly #owner:Owner;readonly #delegationId:string;readonly #options:ArtifactOptions;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:ArtifactOptions){
  store.scope(scope.owner,scope.delegationId);this.#store=store;this.#owner=Object.freeze({...scope.owner});this.#delegationId=scope.delegationId;this.#options=options;
  store.connection.exec(`CREATE TABLE IF NOT EXISTS artifact_revisions (artifact_id TEXT NOT NULL,version INTEGER NOT NULL,delegation_id TEXT NOT NULL REFERENCES delegations(id),value TEXT NOT NULL,PRIMARY KEY(artifact_id,version));
   CREATE TABLE IF NOT EXISTS artifact_requests (delegation_id TEXT NOT NULL REFERENCES delegations(id),request_id TEXT NOT NULL,request_hash TEXT NOT NULL,artifact_id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(delegation_id,request_id));
   CREATE TABLE IF NOT EXISTS artifact_effect_qualifications (delegation_id TEXT NOT NULL,artifact_id TEXT NOT NULL,version INTEGER NOT NULL,goal_revision INTEGER NOT NULL,epoch INTEGER NOT NULL,status TEXT NOT NULL,checked_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS artifact_effect_qualification_lookup ON artifact_effect_qualifications(delegation_id,artifact_id,version,goal_revision,epoch);`);
  store.connection.exec(`CREATE TABLE IF NOT EXISTS artifact_reassessment_qualifications (delegation_id TEXT NOT NULL,artifact_id TEXT NOT NULL,version INTEGER NOT NULL,goal_revision INTEGER NOT NULL,epoch INTEGER NOT NULL,status TEXT NOT NULL,checked_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS artifact_reassessment_qualification_lookup ON artifact_reassessment_qualifications(delegation_id,artifact_id,version,goal_revision,epoch);`);
 }
 #binding(binding:RunBinding):RunBinding{if(!binding||!binding.owner||binding.owner.enterpriseId!==this.#owner.enterpriseId||binding.owner.principalId!==this.#owner.principalId||binding.delegationId!==this.#delegationId||!Number.isSafeInteger(binding.goalRevision)||binding.goalRevision<1||!Number.isSafeInteger(binding.epoch)||binding.epoch<0||!Number.isSafeInteger(binding.generation)||binding.generation<1||!['main','worker'].includes(binding.role)||(binding.role==='worker'&&(typeof binding.assignmentId!=='string'||!binding.assignmentId.trim())))throw new StoreError('artifact_unqualified','成果读取或写入资格已失效。',409);return Object.freeze({owner:this.#owner,delegationId:this.#delegationId,goalRevision:binding.goalRevision,epoch:binding.epoch,generation:binding.generation,role:binding.role,...(binding.assignmentId?{assignmentId:binding.assignmentId}:{})});}
 #qualify(binding:RunBinding):void {const scope=this.#store.scope(this.#owner,this.#delegationId);let current=false;try{current=this.#options.isCurrent(binding)===true;}catch{}if(scope.lifecycle!=='active'||scope.goalRevision!==binding.goalRevision||!current)throw new StoreError('artifact_unqualified','成果读取或写入资格已失效。',409);}
 async #verify(binding:RunBinding,evidence:readonly ArtifactEvidence[]):Promise<void>{if(this.#store.connection.isTransaction)throw new StoreError('artifact_transaction','准确依据核对不能在业务事务内等待。');try{await this.#options.verifyEvidence(binding,structuredClone(evidence));}catch{throw new StoreError('artifact_evidence_unavailable','成果的准确依据当前不可读取。',409);}this.#qualify(binding);}
 #effectCurrent(effect:EffectAssessment,q:{goalRevision:number;epoch:number}):boolean{try{return this.#options.currentEpoch?.()===q.epoch&&this.#options.isEffectCurrent?.(structuredClone(effect),q)===true;}catch{return false;}}
 async #verifyContent(binding:RunBinding,content:ArtifactContent):Promise<void>{
  const effect=effectOfContent(content);if(effect&&binding.role!=='main')throw new StoreError('artifact_effect_role','只有主Agent可保存或读取经营效果判断。',403);
  await this.#verify(binding,content.evidence);if(!effect)return;
  if(!this.#options.verifyEffect||!this.#options.currentEpoch)throw new StoreError('artifact_effect_unavailable','效果判断的准确业务关联核对未就绪。',409);
  try{await this.#options.verifyEffect(binding,structuredClone(effect));}catch{throw new StoreError('artifact_effect_unavailable','效果判断的准确业务关联当前不可读取。',409);}
  this.#qualify(binding);if(!this.#effectCurrent(effect,binding))throw new StoreError('artifact_effect_unavailable','效果判断关联资格已变化。',409);
 }
 #markEffect(binding:RunBinding,value:ArtifactRevision,status:'qualified'|'unavailable'):void{if(effectOfContent(value.content))this.#store.connection.prepare('INSERT INTO artifact_effect_qualifications VALUES (?,?,?,?,?,?,?)').run(this.#delegationId,value.artifactId,value.version,binding.goalRevision,binding.epoch,status,this.#options.now?.()??new Date().toISOString());}
 #markReassessment(binding:RunBinding,value:Pick<ArtifactRevision,'artifactId'|'version'>,status:'qualified'|'unavailable'):void{this.#store.connection.prepare('INSERT INTO artifact_reassessment_qualifications VALUES (?,?,?,?,?,?,?)').run(this.#delegationId,value.artifactId,value.version,binding.goalRevision,binding.epoch,status,this.#options.now?.()??new Date().toISOString());}
 #revision(ref:ArtifactReference):ArtifactRevision {const row=this.#store.connection.prepare('SELECT value FROM artifact_revisions WHERE delegation_id=? AND artifact_id=? AND version=?').get(this.#delegationId,ref.artifactId,ref.version);if(!row)throw new StoreError('artifact_not_found','未找到当前委托的准确成果版本。',404);return JSON.parse(row.value as string);}
 async save(binding:RunBinding,input:SaveArtifact):Promise<ArtifactRevision>{
  binding=this.#binding(binding);this.#qualify(binding);input=inputOf(input);const content=input.content;
  const requestHash=createHash('sha256').update(JSON.stringify([input.artifactId??null,input.expectedVersion,input.reason,content,binding.goalRevision,binding.epoch,binding.role,binding.assignmentId??null])).digest('hex');
  try{await this.#verifyContent(binding,content);}catch(error){if(effectOfContent(content)&&binding.role==='main'){const replay=this.#store.connection.prepare('SELECT request_hash,artifact_id,version FROM artifact_requests WHERE delegation_id=? AND request_id=?').get(this.#delegationId,input.requestId);if(replay?.request_hash===requestHash)this.#markEffect(binding,this.#revision({artifactId:replay.artifact_id as string,version:replay.version as number}),'unavailable');}throw error;}
  return this.#store.withTransaction(()=>{
   this.#qualify(binding);const effect=effectOfContent(content);if(effect&&!this.#effectCurrent(effect,binding))throw new StoreError('artifact_effect_unavailable','效果判断提交前关联资格已变化。',409);const artifactId=input.artifactId??randomUUID();
   const receipt=this.#store.connection.prepare('SELECT request_hash,artifact_id,version FROM artifact_requests WHERE delegation_id=? AND request_id=?').get(this.#delegationId,input.requestId);
   if(receipt){if(receipt.request_hash!==requestHash)throw new StoreError('artifact_request_conflict','同一成果请求身份不能用于不同内容。',409);const saved=this.#revision({artifactId:receipt.artifact_id as string,version:receipt.version as number});this.#markEffect(binding,saved,'qualified');return saved;}
   const previous=this.#store.connection.prepare('SELECT delegation_id,value FROM artifact_revisions WHERE artifact_id=? ORDER BY version DESC LIMIT 1').get(artifactId);
   if(previous&&previous.delegation_id!==this.#delegationId)throw new StoreError('artifact_not_found','未找到当前委托的准确成果版本。',404);
   const prior:ArtifactRevision|undefined=previous?JSON.parse(previous.value as string):undefined;
   if(input.expectedVersion!==(prior?.version??0)||(!input.artifactId&&input.expectedVersion!==0))throw new StoreError('artifact_conflict','成果版本已变化，请读取当前版本后明确修订。',409);
   const priorEffect=prior&&effectOfContent(prior.content);if(prior&&((Boolean(priorEffect)!==Boolean(effect))||(priorEffect&&effect&&(priorEffect.plan.artifactId!==effect.plan.artifactId||priorEffect.plan.version!==effect.plan.version||priorEffect.choiceId!==effect.choiceId))))throw new StoreError('artifact_effect_association','同一效果判断不能改挂方案或选择，也不能转换为普通成果。',409);
   const version=(prior?.version??0)+1;
   const value:ArtifactRevision={artifactId,version,kind:content.kind,content,reason:input.reason,createdAt:this.#options.now?.()??new Date().toISOString(),goalRevision:binding.goalRevision,epoch:binding.epoch,actor:{role:binding.role,...(binding.assignmentId?{assignmentId:binding.assignmentId}:{}),generation:binding.generation},supersedes:prior?{artifactId,version:prior.version}:null};
   this.#store.connection.prepare('INSERT INTO artifact_revisions VALUES (?,?,?,?)').run(artifactId,version,this.#delegationId,JSON.stringify(value));
   this.#store.connection.prepare('INSERT INTO artifact_requests VALUES (?,?,?,?,?)').run(this.#delegationId,input.requestId,requestHash,artifactId,version);this.#markEffect(binding,value,'qualified');return structuredClone(value);
  });
 }
 async read(binding:RunBinding,ref:ArtifactReference):Promise<ArtifactRevision>{binding=this.#binding(binding);this.#qualify(binding);const value=this.#revision(referenceOf(ref)),effect=effectOfContent(value.content);if(value.goalRevision!==binding.goalRevision||(!effect&&value.epoch!==binding.epoch))throw new StoreError('artifact_historical','历史成果须按当前目标和资料资格重新建立依据。',409);if(effect&&binding.role!=='main')throw new StoreError('artifact_effect_role','只有主Agent可保存或读取经营效果判断。',403);try{await this.#verifyContent(binding,value.content);this.#store.withTransaction(()=>{this.#qualify(binding);if(effect&&!this.#effectCurrent(effect,binding))throw new StoreError('artifact_effect_unavailable','效果判断读回前关联资格已变化。',409);this.#markEffect(binding,value,'qualified');});return structuredClone(value);}catch(error){this.#markEffect(binding,value,'unavailable');throw error;}}
 /** Outcome facts retain the selected original plan; all of its exact sources must still be authorized now. */
 async readForOutcome(binding:RunBinding,ref:ArtifactReference):Promise<ArtifactRevision>{binding=this.#binding(binding);this.#qualify(binding);if(binding.role!=='main')throw new StoreError('artifact_role','仅主Agent可核对经营结果关联。',403);const value=this.#revision(referenceOf(ref));if(value.kind!=='plan'||value.goalRevision!==binding.goalRevision)throw new StoreError('artifact_historical','结果关联须属于当前目标的准确原方案。',409);await this.#verify(binding,value.content.evidence);return structuredClone(value);}
 /** Exact-body re-assessment is the only ordinary cross-epoch read path; ordinary read stays epoch-bound. */
 async reassessment(inputBinding:RunBinding,inputRef:ArtifactReference):Promise<ArtifactReassessment>{
  const now=()=>this.#options.now?.()??new Date().toISOString();
  let binding:RunBinding,value:ArtifactRevision|undefined;
  try{
   binding=this.#binding(inputBinding);const ref=referenceOf(inputRef);this.#qualify(binding);value=this.#revision(ref);
   if(value.kind==='judgment'&&effectOfContent(value.content))throw new StoreError('artifact_effect_path','经营效果判断必须沿既有效果专用路径重核。',409);
   if(value.goalRevision!==binding.goalRevision)throw new StoreError('artifact_goal_scope','待复核成果不属于当前目标。',409);
   await this.#verify(binding,value.content.evidence);
   this.#store.withTransaction(()=>{this.#qualify(binding!);this.#markReassessment(binding!,value!,'qualified');});
   const latest=this.#store.connection.prepare('SELECT version,value->>\'$.goalRevision\' AS goal_revision,value->>\'$.epoch\' AS epoch FROM artifact_revisions WHERE delegation_id=? AND artifact_id=? ORDER BY version DESC LIMIT 1').get(this.#delegationId,value.artifactId);
   const current=latest?.version===value.version&&latest?.goal_revision===binding.goalRevision&&latest?.epoch===binding.epoch;
   return structuredClone({status:'qualified' as const,revision:value,accessQualification:value.epoch===binding.epoch?'current':'historical',useQualification:current?'current':'historical',reassessmentDue:true as const,checkedAt:now()});
  }catch(error){
   if(value){const b:RunBinding=binding!,v:ArtifactRevision=value;this.#store.withTransaction(()=>{try{this.#markReassessment(b,v,'unavailable');}catch{/* Keep the read failure; receipt persistence must not fabricate access. */}});}
   const code=error instanceof StoreError?error.code:'artifact_reassessment_unavailable';
   return{status:'unavailable',artifactId:inputBinding&&typeof inputRef==='object'&&inputRef?.artifactId?inputRef.artifactId:'',version:inputRef?.version??0,...(value?{kind:value.kind,createdAt:value.createdAt,goalRevision:value.goalRevision,epoch:value.epoch}:{}),accessQualification:'unavailable',useQualification:'unavailable',reassessmentDue:true,restriction:code,unknowns:['The exact original body cannot be re-established under current authorization; no latest version may replace it.'],checkedAt:now()};
  }
 }
 async list(binding:RunBinding):Promise<readonly ArtifactMetadata[]>{
  binding=this.#binding(binding);this.#qualify(binding);
  const rows=this.#store.connection.prepare("SELECT artifact_id,version,value->>'$.kind' AS kind,value->>'$.createdAt' AS created_at,value->>'$.goalRevision' AS goal_revision,value->>'$.epoch' AS epoch,value->>'$.content.effect' AS effect FROM artifact_revisions WHERE delegation_id=? ORDER BY rowid DESC LIMIT 100").all(this.#delegationId);
  return rows.reverse().map(row=>({artifactId:row.artifact_id as string,version:row.version as number,kind:row.kind as ArtifactContent['kind'],createdAt:row.created_at as string,goalRevision:row.goal_revision as number,epoch:row.epoch as number,...(row.effect?{effect:true as const}:{}),qualification:row.effect?(binding.role==='main'&&this.isEffectQualified({artifactId:row.artifact_id as string,version:row.version as number},binding)?'current':'unavailable'):row.goal_revision===binding.goalRevision&&row.epoch===binding.epoch?'current':'historical'}));
 }
 /** Host-only safe projection check; current receipt and exact underlying facts are both required. */
 isEffectQualified(ref:ArtifactReference,q:{goalRevision:number;epoch:number}):boolean{try{const scope=this.#store.scope(this.#owner,this.#delegationId);if(['ending','ended'].includes(scope.lifecycle)||scope.goalRevision!==q.goalRevision||!Number.isSafeInteger(q.epoch)||q.epoch<0)return false;const value=this.#revision(referenceOf(ref)),effect=effectOfContent(value.content);if(!effect||value.goalRevision!==q.goalRevision||!this.#effectCurrent(effect,q))return false;const row=this.#store.connection.prepare('SELECT status FROM artifact_effect_qualifications WHERE delegation_id=? AND artifact_id=? AND version=? AND goal_revision=? AND epoch=? ORDER BY rowid DESC LIMIT 1').get(this.#delegationId,value.artifactId,value.version,q.goalRevision,q.epoch);return row?.status==='qualified';}catch{return false;}}
 /** Latest-version binding check for follow-up admission; exact source revalidation is still required separately. */
 isCurrentReference(binding:RunBinding,ref:ArtifactReference):boolean{
  try{binding=this.#binding(binding);this.#qualify(binding);return this.isCurrentBusinessReference(ref,{goalRevision:binding.goalRevision,epoch:binding.epoch});}catch{return false;}
 }
 /** Host-only business association across native handle generations; not an Agent read authorization. */
 isCurrentBusinessReference(ref:ArtifactReference,qualification:{goalRevision:number;epoch:number}):boolean{
  try{const scope=this.#store.scope(this.#owner,this.#delegationId);if(!Number.isSafeInteger(qualification.goalRevision)||qualification.goalRevision<1||!Number.isSafeInteger(qualification.epoch)||qualification.epoch<0||scope.goalRevision!==qualification.goalRevision)return false;ref=referenceOf(ref);const row=this.#store.connection.prepare("SELECT version,value->>'$.goalRevision' AS goal_revision,value->>'$.epoch' AS epoch FROM artifact_revisions WHERE delegation_id=? AND artifact_id=? ORDER BY version DESC LIMIT 1").get(this.#delegationId,ref.artifactId);return Boolean(row&&row.version===ref.version&&row.goal_revision===qualification.goalRevision&&row.epoch===qualification.epoch);}catch{return false;}
 }
 /** Exact latest advice identity for pending cognition work; source eligibility is checked separately. */
 isCurrentGoalReference(ref:ArtifactReference,goalRevision:number):boolean{
  try{this.#store.scope(this.#owner,this.#delegationId);ref=referenceOf(ref);const row=this.#store.connection.prepare("SELECT version,value->>'$.goalRevision' AS goal_revision FROM artifact_revisions WHERE delegation_id=? AND artifact_id=? ORDER BY version DESC LIMIT 1").get(this.#delegationId,ref.artifactId);return Boolean(row&&row.version===ref.version&&row.goal_revision===goalRevision);}catch{return false;}
 }
 history():readonly ArtifactRevision[]{this.#store.scope(this.#owner,this.#delegationId);return this.#store.connection.prepare('SELECT value FROM artifact_revisions WHERE delegation_id=? ORDER BY rowid').all(this.#delegationId).map(row=>JSON.parse(row.value as string));}
}
