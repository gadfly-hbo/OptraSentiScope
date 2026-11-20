import {createHash,randomUUID} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {ArtifactReference,ArtifactReassessment} from './artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

export type SupportStatus='active'|'withdrawn';
export type CognitionConclusion='maintained'|'limited'|'revised'|'withdrawn'|'unknown';
export type ReassessmentConclusion='maintain'|'adjust'|'limit'|'withdraw'|'unknown';
export type CognitionTrigger=
 |{kind:'source_event';eventId:string;sourceId:string;observedAt:string}
 |{kind:'execution';id:string;revision:number}
 |{kind:'observation';id:string;revision:number}
 |{kind:'followup';followupId:string}
 |{kind:'experience';id:string;version:number};
export interface SaveSupportRelation {
 id?:string;expectedRevision?:number;requestId:string;judgment:ArtifactReference;plan:ArtifactReference;
 scope:string;why:string;reason:string;status?:SupportStatus;
}
export interface SupportRelation extends Omit<SaveSupportRelation,'id'|'expectedRevision'|'requestId'> {
 id:string;revision:number;requestId:string;createdAt:string;goalRevision:number;epoch:number;binding:RunBinding;
 supersedes:{id:string;revision:number}|null;
}
export interface SaveCognitionReview {
 requestId:string;judgment:ArtifactReference;resultJudgment?:ArtifactReference;trigger:CognitionTrigger;
 conclusion:CognitionConclusion;summary:string;reason:string;changes:readonly string[];limitations:readonly string[];
 unknowns:readonly string[];nextReview:{condition:string;at?:string;sourceIds?:readonly string[]};
}
export interface CognitionReview extends SaveCognitionReview {
 id:string;createdAt:string;goalRevision:number;epoch:number;binding:RunBinding;reevaluationIds:readonly string[];
}
export type CognitionReviewResult=CognitionReview&{reevaluations:readonly CognitionReevaluation[]};
export interface CognitionReevaluation {
 id:string;reviewId:string;relation:{id:string;revision:number};judgment:ArtifactReference;plan:ArtifactReference;
 relations?:readonly {id:string;revision:number}[];
 scope:string;why:string;binding:RunBinding;createdAt:string;updatedAt:string;
 status:'pending'|'completed'|'blocked'|'superseded'|'closed';
 result?:{requestId:string;conclusion:ReassessmentConclusion;reason:string;nextSteps:readonly string[];unknowns:readonly string[];outcomePlan?:ArtifactReference;at:string};
}
export interface SaveReevaluationResult {
 id:string;requestId:string;expectedRelationRevision:number;conclusion:ReassessmentConclusion;
 reason:string;nextSteps:readonly string[];unknowns:readonly string[];outcomePlan?:ArtifactReference;
}
export interface CognitionOptions {
 isCurrent(binding:RunBinding):boolean;currentEpoch():number;
 isLatestPlan(ref:ArtifactReference,goalRevision:number):boolean;
 artifactKind(ref:ArtifactReference):'judgment'|'plan'|undefined;
 verifyArtifact(binding:RunBinding,ref:ArtifactReference):Promise<ArtifactReassessment>;
 verifyTrigger(binding:RunBinding,trigger:CognitionTrigger):Promise<void>;
 revalidateTrigger(binding:RunBinding,trigger:CognitionTrigger):boolean;
 now?():string;
}
export type CognitionProjection=Record<string,unknown>;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid():never{throw new StoreError('cognition_invalid','认识修正或依赖关系字段无效。');}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))return invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=20000):string{if(typeof value!=='string'||!value.trim()||value.length>max)return invalid();return value.trim();}
function integer(value:unknown,min:number):number{if(!Number.isSafeInteger(value)||Number(value)<min)return invalid();return Number(value);}
function strings(value:unknown,min=0):readonly string[]{if(!Array.isArray(value)||value.length<min||value.length>100)return invalid();return value.map(v=>text(v));}
function artifact(value:unknown):ArtifactReference{const a=object(value,['artifactId','version']);return{artifactId:text(a.artifactId,500),version:integer(a.version,1)};}
function instant(value:unknown):string{
 const source=typeof value==='string'?value:'';const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(source);if(!m)return invalid();
 const y=+m[1],month=+m[2],day=+m[3],days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||+m[4]>23||+m[5]>59||+m[6]>59||!Number.isFinite(Date.parse(source)))return invalid();return new Date(source).toISOString();
}
function triggerOf(value:unknown):CognitionTrigger{
 const raw=object(value,['kind','eventId','sourceId','observedAt','id','revision','followupId','version']);
 if(raw.kind==='source_event')return{kind:'source_event',eventId:text(raw.eventId,500),sourceId:text(raw.sourceId,500),observedAt:instant(raw.observedAt)};
 if(raw.kind==='execution'||raw.kind==='observation')return{kind:raw.kind,id:text(raw.id,500),revision:integer(raw.revision,1)};
 if(raw.kind==='followup')return{kind:'followup',followupId:text(raw.followupId,500)};
 if(raw.kind==='experience')return{kind:'experience',id:text(raw.id,500),version:integer(raw.version,1)};
 return invalid();
}
function supportInput(value:unknown):SaveSupportRelation{
 const raw=object(value,['id','expectedRevision','requestId','judgment','plan','scope','why','reason','status']);
 if(raw.status!==undefined&&!['active','withdrawn'].includes(raw.status as string))return invalid();
 return{...(raw.id===undefined?{}:{id:text(raw.id,500)}),expectedRevision:integer(raw.expectedRevision??0,0),requestId:text(raw.requestId,500),judgment:artifact(raw.judgment),plan:artifact(raw.plan),scope:text(raw.scope),why:text(raw.why),reason:text(raw.reason),status:(raw.status??'active') as SupportStatus};
}
function reviewInput(value:unknown):SaveCognitionReview{
 const raw=object(value,['requestId','judgment','resultJudgment','trigger','conclusion','summary','reason','changes','limitations','unknowns','nextReview']);
 if(!['maintained','limited','revised','withdrawn','unknown'].includes(raw.conclusion as string))return invalid();
 const next=object(raw.nextReview,['condition','at','sourceIds']);
 return{requestId:text(raw.requestId,500),judgment:artifact(raw.judgment),...(raw.resultJudgment===undefined?{}:{resultJudgment:artifact(raw.resultJudgment)}),trigger:triggerOf(raw.trigger),conclusion:raw.conclusion as CognitionConclusion,summary:text(raw.summary),reason:text(raw.reason),changes:strings(raw.changes),limitations:strings(raw.limitations),unknowns:strings(raw.unknowns),nextReview:{condition:text(next.condition),...(next.at===undefined?{}:{at:instant(next.at)}),...(next.sourceIds===undefined?{}:{sourceIds:strings(next.sourceIds)})}};
}
function resultInput(value:unknown):SaveReevaluationResult{
 const raw=object(value,['id','requestId','expectedRelationRevision','conclusion','reason','nextSteps','unknowns','outcomePlan']);
 if(!['maintain','adjust','limit','withdraw','unknown'].includes(raw.conclusion as string))return invalid();
 return{id:text(raw.id,500),requestId:text(raw.requestId,500),expectedRelationRevision:integer(raw.expectedRelationRevision,1),conclusion:raw.conclusion as ReassessmentConclusion,reason:text(raw.reason),nextSteps:strings(raw.nextSteps),unknowns:strings(raw.unknowns),...(raw.outcomePlan===undefined?{}:{outcomePlan:artifact(raw.outcomePlan)})};
}
/** Explicit business support and recoverable re-evaluation facts; no Runtime, ticket authority or timer. */
export class CognitionStore {
 readonly #store:SentiStore;readonly #scope:{owner:Owner;delegationId:string};readonly #options:CognitionOptions;readonly #namespace:string;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:CognitionOptions){
  store.scope(scope.owner,scope.delegationId);this.#store=store;this.#scope={owner:{...scope.owner},delegationId:scope.delegationId};this.#options=options;
  this.#namespace=digest([scope.owner.enterpriseId,scope.owner.principalId,scope.delegationId]);
  store.connection.exec(`CREATE TABLE IF NOT EXISTS cognition_supports(namespace TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id,revision));
   CREATE TABLE IF NOT EXISTS cognition_reviews(namespace TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id));
   CREATE TABLE IF NOT EXISTS cognition_reevaluations(namespace TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id));
   CREATE TABLE IF NOT EXISTS cognition_requests(namespace TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,kind TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(namespace,request_id));`);
 }
 #now(){return instant(this.#options.now?.()??new Date().toISOString());}
 #binding(value:RunBinding):RunBinding{
  if(value?.owner?.enterpriseId!==this.#scope.owner.enterpriseId||value?.owner?.principalId!==this.#scope.owner.principalId||value.delegationId!==this.#scope.delegationId||value.role!=='main')throw new StoreError('cognition_scope','只有当前主Agent可修正认识或重评建议。',403);
  if(!Number.isSafeInteger(value.goalRevision)||value.goalRevision<1||!Number.isSafeInteger(value.epoch)||value.epoch<0||!Number.isSafeInteger(value.generation)||value.generation<1)return invalid();
  return{owner:{...this.#scope.owner},delegationId:value.delegationId,goalRevision:value.goalRevision,epoch:value.epoch,generation:value.generation,role:'main'};
 }
 #current(binding:RunBinding){const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);if(d.lifecycle!=='active'||d.goalRevision!==binding.goalRevision||this.#options.isCurrent(binding)!==true)throw new StoreError('cognition_stale','认识修正的当前运行资格已变化。',409);}
 #request(kind:'review'|'reevaluation',requestId:string,hash:string):{recordId:string;revision:number}|undefined{const row=this.#store.connection.prepare('SELECT request_hash,record_id,revision FROM cognition_requests WHERE namespace=? AND request_id=?').get(this.#namespace,requestId) as {request_hash:string;record_id:string;revision:number}|undefined;if(!row)return undefined;if(row.request_hash!==hash)throw new StoreError('cognition_conflict','同一认识修正请求不能改写内容。',409);return{recordId:row.record_id,revision:row.revision};}
 #supportInputOf(record:SupportRelation):SaveSupportRelation{return{expectedRevision:record.revision-1,requestId:record.requestId,judgment:record.judgment,plan:record.plan,scope:record.scope,why:record.why,reason:record.reason,status:record.status};}
 #supportHash(binding:RunBinding,value:SaveSupportRelation){return digest({kind:'support',goalRevision:binding.goalRevision,epoch:binding.epoch,value});}
 #supportRequest(binding:RunBinding,requestId:string,hash:string):SupportRelation|undefined{
  const row=this.#store.connection.prepare('SELECT request_hash,record_id,revision FROM cognition_requests WHERE namespace=? AND request_id=?').get(this.#namespace,requestId) as{request_hash:string;record_id:string;revision:number}|undefined;if(!row)return undefined;
  const record=JSON.parse(this.#store.connection.prepare('SELECT value FROM cognition_supports WHERE namespace=? AND id=? AND revision=?').get(this.#namespace,row.record_id,row.revision)!.value as string) as SupportRelation;
  const canonical=this.#supportHash(binding,this.#supportInputOf(record));const legacy=digest({kind:'support',goalRevision:record.goalRevision,epoch:record.epoch,value:record});
  if(row.request_hash!==canonical&&row.request_hash!==legacy)throw new StoreError('cognition_conflict','同一认识修正请求不能改写内容。',409);
  if(hash!==canonical&&hash!==row.request_hash)throw new StoreError('cognition_conflict','同一认识修正请求不能改写内容。',409);return record;
 }
 #writeSupport(value:SupportRelation,hash:string){this.#store.connection.prepare('INSERT INTO cognition_supports VALUES (?,?,?,?)').run(this.#namespace,value.id,value.revision,JSON.stringify(value));this.#store.connection.prepare('INSERT INTO cognition_requests VALUES (?,?,?,?,?,?)').run(this.#namespace,value.requestId,hash,'support',value.id,value.revision);}
 supports():SupportRelation[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM cognition_supports WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(r=>JSON.parse(r.value as string));}
 latestSupports():SupportRelation[]{return [...new Map(this.supports().map(r=>[r.id,r])).values()];}
 reviews():CognitionReview[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM cognition_reviews WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(r=>JSON.parse(r.value as string));}
 reevaluations():CognitionReevaluation[]{this.#store.scope(this.#scope.owner,this.#scope.delegationId);return this.#store.connection.prepare('SELECT value FROM cognition_reevaluations WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(r=>JSON.parse(r.value as string));}
 #requiredReevaluation(id:string):CognitionReevaluation{const row=this.#store.connection.prepare('SELECT value FROM cognition_reevaluations WHERE namespace=? AND id=?').get(this.#namespace,text(id,500));if(!row)throw new StoreError('cognition_not_found','未找到准确建议重评责任。',404);return JSON.parse(row.value as string);}
 #writeReevaluation(value:CognitionReevaluation){this.#store.connection.prepare('INSERT INTO cognition_reevaluations VALUES (?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET value=excluded.value').run(this.#namespace,value.id,JSON.stringify(value));}
 #reachablePlans(binding:RunBinding,root:ArtifactReference){
  const relations=this.latestSupports().filter(relation=>relation.status==='active'&&relation.goalRevision===binding.goalRevision);
  const bySource=new Map<string,SupportRelation[]>();for(const relation of relations){const list=bySource.get(relation.judgment.artifactId)??[];list.push(relation);bySource.set(relation.judgment.artifactId,list);}
  const terminal:{relation:SupportRelation;relations:SupportRelation[];scope:string;why:string;judgment:ArtifactReference}[]=[],seenPaths=new Set<string>(),pathKey=(path:SupportRelation[])=>JSON.stringify(path.map(item=>[item.id,item.revision]));
  const visit=(source:ArtifactReference,path:SupportRelation[],seenSources:Set<string>,seenRelations:Set<string>)=>{
   if(seenSources.has(source.artifactId)||path.length>50)return;const branchSources=new Set([...seenSources,source.artifactId]);
   for(const relation of bySource.get(source.artifactId)??[]){
    if(seenRelations.has(`${relation.id}:${relation.revision}`)||!this.#options.isLatestPlan(relation.plan,binding.goalRevision))continue;
    const nextPath=[...path,relation],scope=nextPath.map(item=>item.scope).join('；'),why=nextPath.map(item=>item.why).join('；'),nextRelations=new Set([...seenRelations,`${relation.id}:${relation.revision}`]);
    if(this.#options.artifactKind(relation.plan)==='plan'){const key=pathKey(nextPath);if(seenPaths.has(key))continue;if(terminal.length>=1000)throw new StoreError('cognition_graph_too_large','显式依赖路径超出安全上限。',409);seenPaths.add(key);terminal.push({relation,relations:nextPath,scope,why,judgment:root});continue;}
    if(this.#options.artifactKind(relation.plan)==='judgment')visit(relation.plan,nextPath,branchSources,nextRelations);
   }
  };
  visit(root,[],new Set(),new Set());return terminal;
 }
 #supportForAdjustedPlan(binding:RunBinding,previous:SupportRelation,plan:ArtifactReference,reason:string,requestId:string):SupportRelation{
  const input:SaveSupportRelation={requestId:requestId.slice(0,500),judgment:previous.judgment,plan,scope:previous.scope,why:previous.why,reason,status:'active'};const hash=this.#supportHash(binding,input);
  const replay=this.#supportRequest(binding,input.requestId,hash);if(replay)return replay;
  const record:SupportRelation={...input,id:previous.id,revision:previous.revision+1,createdAt:this.#now(),goalRevision:binding.goalRevision,epoch:binding.epoch,binding,supersedes:{id:previous.id,revision:previous.revision}};
  this.#writeSupport(record,hash);return record;
 }
 async saveSupport(inputBinding:RunBinding,input:SaveSupportRelation):Promise<SupportRelation>{
  const binding=this.#binding(inputBinding),value=supportInput(input),hash=this.#supportHash(binding,value);
  const prior=this.#supportRequest(binding,value.requestId,hash);if(prior)return structuredClone(prior);
  const judgment=await this.#options.verifyArtifact(binding,value.judgment),plan=await this.#options.verifyArtifact(binding,value.plan);
  if(judgment.status!=='qualified'||plan.status!=='qualified'||judgment.revision.kind!=='judgment'||!['judgment','plan'].includes(plan.revision.kind))throw new StoreError('cognition_artifact_unavailable','支持关系须准确读回判断及判断/方案原件。',409);
  if(this.#options.artifactKind(value.plan)!==plan.revision.kind||!this.#options.isLatestPlan(value.plan,binding.goalRevision))throw new StoreError('cognition_target_stale','依赖对象必须是当前目标的最新准确版本。',409);
  return this.#store.withTransaction(()=>{
   this.#current(binding);const replay=this.#supportRequest(binding,value.requestId,hash);if(replay)return structuredClone(replay);
   if(this.#options.artifactKind(value.plan)!==plan.revision.kind||!this.#options.isLatestPlan(value.plan,binding.goalRevision))throw new StoreError('cognition_target_stale','依赖对象必须是当前目标的最新准确版本。',409);
   const previous=value.id?this.latestSupports().find(r=>r.id===value.id):undefined;
   if(value.expectedRevision!==(previous?.revision??0)||(value.id&&!previous)||(!value.id&&value.expectedRevision!==0))throw new StoreError('cognition_conflict','支持关系版本已变化，请读取当前版本后修订。',409);
   if(previous&&(digest(previous.judgment)!==digest(value.judgment)||digest(previous.plan)!==digest(value.plan)))throw new StoreError('cognition_association_changed','同一支持关系不能改挂其他判断或建议。',409);
   const id=value.id??randomUUID(),now=this.#now(),record:SupportRelation={...value,id,revision:(previous?.revision??0)+1,createdAt:now,goalRevision:binding.goalRevision,epoch:binding.epoch,binding,supersedes:previous?{id,revision:previous.revision}:null};
   this.#writeSupport(record,hash);return structuredClone(record);
  });
 }
 async review(inputBinding:RunBinding,input:SaveCognitionReview):Promise<CognitionReviewResult>{
  const binding=this.#binding(inputBinding),value=reviewInput(input),hash=digest({kind:'review',goalRevision:binding.goalRevision,epoch:binding.epoch,value});
  const prior=this.#request('review',value.requestId,hash);if(prior){const review=this.reviews().find(r=>r.id===prior.recordId)!;return{...review,reevaluations:this.reevaluations().filter(r=>r.reviewId===review.id)};}
  const original=await this.#options.verifyArtifact(binding,value.judgment);
  if(original.status!=='qualified'||original.revision.kind!=='judgment')throw new StoreError('cognition_artifact_unavailable','认识复核必须从准确原判断版本开始。',409);
  if(value.resultJudgment&&(value.resultJudgment.artifactId!==value.judgment.artifactId||value.resultJudgment.version<=value.judgment.version))throw new StoreError('cognition_result_invalid','新判断必须是同一判断事项的更高版本。',409);
  if(value.resultJudgment&&['maintained','unknown'].includes(value.conclusion))throw new StoreError('cognition_result_invalid','维持或证据不足不得制造空判断版本。',409);
  if(value.conclusion==='revised'&&!value.resultJudgment)throw new StoreError('cognition_result_invalid','判断内容修订必须关联明确新版本。',409);
  if(value.resultJudgment){const result=await this.#options.verifyArtifact(binding,value.resultJudgment);if(result.status!=='qualified')throw new StoreError('cognition_artifact_unavailable','新判断版本当前不能准确读回。',409);}
  await this.#options.verifyTrigger(binding,value.trigger);this.#current(binding);
  return this.#store.withTransaction(()=>{
   this.#current(binding);const replay=this.#request('review',value.requestId,hash);if(replay){const review=this.reviews().find(r=>r.id===replay.recordId)!;return{...review,reevaluations:this.reevaluations().filter(r=>r.reviewId===review.id)};}
   if(value.resultJudgment&&!this.#options.isLatestPlan(value.resultJudgment,binding.goalRevision))throw new StoreError('cognition_target_changed','判断已有更新版本，旧认识结果不能关闭当前复核。',409);
   if(!this.#options.revalidateTrigger(binding,value.trigger))throw new StoreError('cognition_trigger_stale','触发事实在提交前已变化，不能保存该认识检查。',409);
   const duplicate=this.reviews().find(r=>digest({trigger:r.trigger,judgment:r.judgment,goalRevision:r.goalRevision,epoch:r.epoch})===digest({trigger:value.trigger,judgment:value.judgment,goalRevision:binding.goalRevision,epoch:binding.epoch}));
   if(duplicate)return{...duplicate,reevaluations:this.reevaluations().filter(r=>r.reviewId===duplicate.id)};
   const id=randomUUID(),now=this.#now();const reachable=value.conclusion==='maintained'||value.conclusion==='unknown'?[]:this.#reachablePlans(binding,value.judgment);
   const tasks=reachable.map(({relation,relations,scope,why,judgment})=>({id:digest([id,...relations.map(item=>[item.id,item.revision])]),reviewId:id,relation:{id:relation.id,revision:relation.revision},...(relations.length>1?{relations:relations.map(item=>({id:item.id,revision:item.revision}))}:{}),judgment,plan:relation.plan,scope,why,binding,createdAt:now,updatedAt:now,status:'pending' as const}));
   const record:CognitionReview={...value,id,createdAt:now,goalRevision:binding.goalRevision,epoch:binding.epoch,binding,reevaluationIds:tasks.map(t=>t.id)};
   this.#store.connection.prepare('INSERT INTO cognition_reviews VALUES (?,?,?)').run(this.#namespace,id,JSON.stringify(record));
   this.#store.connection.prepare('INSERT INTO cognition_requests VALUES (?,?,?,?,?,?)').run(this.#namespace,value.requestId,hash,'review',id,1);
   for(const task of tasks)this.#writeReevaluation(task);return structuredClone({...record,reevaluations:tasks});
  });
 }
 async complete(inputBinding:RunBinding,input:SaveReevaluationResult):Promise<CognitionReevaluation>{
  const binding=this.#binding(inputBinding),value=resultInput(input),hash=digest({kind:'reevaluation',goalRevision:binding.goalRevision,epoch:binding.epoch,value});
  const prior=this.#request('reevaluation',value.requestId,hash);if(prior)return structuredClone(this.#requiredReevaluation(prior.recordId));
  const target=await this.#options.verifyArtifact(binding,value.outcomePlan??this.#requiredReevaluation(value.id).plan);
  if(value.outcomePlan&&(value.outcomePlan.artifactId!==this.#requiredReevaluation(value.id).plan.artifactId||value.outcomePlan.version<=this.#requiredReevaluation(value.id).plan.version))throw new StoreError('cognition_result_invalid','方案调整必须是同一建议事项的更高版本。',409);
  if(value.outcomePlan&&['maintain','unknown'].includes(value.conclusion))throw new StoreError('cognition_result_invalid','维持或证据不足不得制造空方案版本。',409);
  if(value.conclusion==='adjust'&&!value.outcomePlan)throw new StoreError('cognition_result_invalid','调整建议必须关联明确新方案版本。',409);
  if(target.status!=='qualified'&&value.conclusion!=='unknown')throw new StoreError('cognition_target_unavailable','准确建议原件当前不可读，只能保留UNKNOWN或受阻。',409);
  if(value.outcomePlan&&target.status!=='qualified')throw new StoreError('cognition_target_unavailable','新方案版本当前不可准确读回。',409);
  let conflict:undefined|'cognition_target_changed'|'cognition_relation_changed';
  const result= this.#store.withTransaction(()=>{
   this.#current(binding);const replay=this.#request('reevaluation',value.requestId,hash);if(replay)return this.#requiredReevaluation(value.id);
   const task=this.#requiredReevaluation(value.id);if(task.status==='completed')throw new StoreError('cognition_closed','该建议重评已收束，历史不能改写。',409);
   if(value.expectedRelationRevision!==task.relation.revision)throw new StoreError('cognition_conflict','支持关系修订已变化，请读取当前准确重评责任。',409);
   const pathRelations=(task.relations??[task.relation]).map(ref=>({ref,relation:this.latestSupports().find(r=>r.id===ref.id)}));
   if(pathRelations.some(item=>!item.relation||item.relation.revision!==item.ref.revision||item.relation.status!=='active')){task.status='superseded';task.updatedAt=this.#now();this.#writeReevaluation(task);conflict='cognition_relation_changed';return structuredClone(task);}
   const legalAdjustment=Boolean(value.outcomePlan&&value.outcomePlan.artifactId===task.plan.artifactId&&value.outcomePlan.version>task.plan.version&&this.#options.isLatestPlan(value.outcomePlan,binding.goalRevision));
   if(task.binding.goalRevision!==binding.goalRevision||task.binding.epoch!==binding.epoch||(!legalAdjustment&&!this.#options.isLatestPlan(task.plan,binding.goalRevision))||(value.outcomePlan&&!legalAdjustment)){task.status='superseded';task.updatedAt=this.#now();this.#writeReevaluation(task);conflict='cognition_target_changed';return structuredClone(task);}
   if(task.status!=='pending')return structuredClone(task);
   if(legalAdjustment)for(const item of pathRelations){const relation=item.relation!;if(digest(relation.plan)===digest(task.plan))this.#supportForAdjustedPlan(binding,relation,value.outcomePlan!,value.reason,`support-adjust:${value.requestId}:${relation.id}`);}
   task.status=value.conclusion==='unknown'?'blocked':'completed';task.updatedAt=this.#now();task.result={requestId:value.requestId,conclusion:value.conclusion,reason:value.reason,nextSteps:value.nextSteps,unknowns:value.unknowns,...(value.outcomePlan?{outcomePlan:value.outcomePlan}:{}),at:this.#now()};this.#writeReevaluation(task);
   this.#store.connection.prepare('INSERT INTO cognition_requests VALUES (?,?,?,?,?,?)').run(this.#namespace,value.requestId,hash,'reevaluation',task.id,1);return structuredClone(task);
  });
  if(conflict)throw new StoreError(conflict,conflict==='cognition_target_changed'?'建议目标已有新版本，旧重评结果不能关闭当前责任。':'支持关系已有新修订，旧重评结果不能关闭当前责任。',409);
  return result;
 }
 pause():CognitionReevaluation[]{return this.#store.withTransaction(()=>{const ended=['ending','ended'].includes(this.#store.scope(this.#scope.owner,this.#scope.delegationId).lifecycle);for(const task of this.reevaluations())if(ended&&task.status==='pending'){task.status='closed';task.updatedAt=this.#now();this.#writeReevaluation(task);}return this.reevaluations();});}
 hasPending(binding:RunBinding):boolean{try{return this.reevaluations().some(task=>task.status==='pending'&&task.binding.goalRevision===binding.goalRevision&&task.binding.epoch===binding.epoch);}catch{return false;}}
 projection(binding:RunBinding):CognitionProjection{
  this.#store.scope(this.#scope.owner,this.#scope.delegationId);const current=(r:{goalRevision:number;epoch:number})=>r.goalRevision===binding.goalRevision&&r.epoch===binding.epoch;
  const supports=this.latestSupports().map(r=>current(r)?r:{id:r.id,revision:r.revision,judgment:r.judgment,plan:r.plan,status:r.status,goalRevision:r.goalRevision,epoch:r.epoch,qualification:'unavailable'});
  const reviews=this.reviews().map(r=>current(r)?r:{id:r.id,judgment:r.judgment,conclusion:r.conclusion,trigger:r.trigger,goalRevision:r.goalRevision,epoch:r.epoch,qualification:'unavailable'});
  const taskCurrent=(r:CognitionReevaluation)=>r.binding.goalRevision===binding.goalRevision&&r.binding.epoch===binding.epoch;
  const reevaluations=this.reevaluations().map(r=>taskCurrent(r)?r:{id:r.id,reviewId:r.reviewId,relation:r.relation,judgment:r.judgment,plan:r.plan,status:r.status,goalRevision:r.binding.goalRevision,epoch:r.binding.epoch,qualification:'unavailable'});
  const supportHistory=this.supports().map(r=>current(r)?r:{id:r.id,revision:r.revision,judgment:r.judgment,plan:r.plan,status:r.status,goalRevision:r.goalRevision,epoch:r.epoch,qualification:'unavailable'});
  return{supportRelations:supports,supportHistory,reviews,reevaluations,pendingReevaluations:reevaluations.filter(r=>r.status==='pending')};
 }
}
