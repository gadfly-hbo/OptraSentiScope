import {createHash,randomUUID} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {ArtifactEvidence,ArtifactReference} from './artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

export type ExperienceStatus='active'|'limited'|'withdrawn';
export type ExperienceBasis=
 |{kind:'judgment';artifact:ArtifactReference}
 |{kind:'execution';id:string;revision:number}
 |{kind:'observation';id:string;revision:number};
export interface SaveExperience {
 id?:string;expectedVersion?:number;requestId:string;title:string;summary:string;
 evidence:readonly ArtifactEvidence[];basis:readonly ExperienceBasis[];businessConditions:readonly string[];
 validUntil:string;limitations:readonly string[];counterexamples:readonly ArtifactEvidence[];unknowns:readonly string[];
 revalidateWhen:{condition:string;at?:string;sourceIds?:readonly string[]};status:ExperienceStatus;reason:string;
}
export interface ExperienceRevision extends Omit<SaveExperience,'id'|'expectedVersion'|'requestId'> {
 id:string;version:number;requestId:string;sourceDelegationId:string;createdAt:string;goalRevision:number;epoch:number;binding:RunBinding;
 supersedes:{id:string;version:number}|null;
}
export type ExperienceUseDecision='applied'|'not_applied'|'unknown';
export interface SaveExperienceUse {
 requestId:string;experience:{id:string;version:number};decision:ExperienceUseDecision;reason:string;influence:string;artifact?:ArtifactReference;
}
export interface ExperienceUse extends SaveExperienceUse {
 id:string;targetDelegationId:string;experienceTitle:string;createdAt:string;goalRevision:number;epoch:number;binding:RunBinding;
}
export type ExperienceMeta={
 id:string;version:number;title:string;status:ExperienceStatus;sourceDelegationId:string;createdAt:string;validUntil:string;
 qualification:'current'|'expired'|'historical'|'unavailable';
};
export interface ExperienceOptions {
 isCurrent(binding:RunBinding):boolean;currentEpoch():number;now?():string;
 verifyEvidence(binding:RunBinding,evidence:readonly ArtifactEvidence[]):Promise<void>;
 verifyBasis(binding:RunBinding,basis:readonly ExperienceBasis[]):Promise<void>;
 verifyArtifact(binding:RunBinding,ref:ArtifactReference):Promise<void>;
 evidenceCurrent(refs:readonly ArtifactEvidence[]):boolean;
 evidenceCurrentInDelegation(delegationId:string,refs:readonly ArtifactEvidence[]):boolean;
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid():never{throw new StoreError('experience_invalid','经验字段、准确版本或引用无效。');}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))return invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=20000):string{if(typeof value!=='string'||!value.trim()||value.length>max)return invalid();return value.trim();}
function integer(value:unknown,min:number):number{if(!Number.isSafeInteger(value)||Number(value)<min)return invalid();return Number(value);}
function strings(value:unknown,min=0):readonly string[]{if(!Array.isArray(value)||value.length<min||value.length>100)return invalid();return value.map(item=>text(item));}
function instant(value:unknown):string{
 const source=typeof value==='string'?value:'';const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(source);if(!match)return invalid();
 const year=+match[1],month=+match[2],day=+match[3],leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||+match[4]>23||+match[5]>59||+match[6]>59||!Number.isFinite(Date.parse(source)))return invalid();return new Date(source).toISOString();
}
function evidence(value:unknown):ArtifactEvidence{const raw=object(value,['ref','hash']);const hash=text(raw.hash,64);if(!/^[a-f0-9]{64}$/.test(hash))return invalid();return{ref:text(raw.ref,1024),hash};}
function evidences(value:unknown,min=0):readonly ArtifactEvidence[]{if(!Array.isArray(value)||value.length<min||value.length>100)return invalid();return value.map(evidence);}
function artifact(value:unknown):ArtifactReference{const raw=object(value,['artifactId','version']);return{artifactId:text(raw.artifactId,500),version:integer(raw.version,1)};}
function basis(value:unknown):ExperienceBasis{
 const raw=object(value,['kind','artifact','id','revision']);
 if(raw.kind==='judgment')return{kind:'judgment',artifact:artifact(raw.artifact)};
 if(raw.kind==='execution'||raw.kind==='observation')return{kind:raw.kind,id:text(raw.id,500),revision:integer(raw.revision,1)};
 return invalid();
}
function bases(value:unknown):readonly ExperienceBasis[]{if(!Array.isArray(value)||value.length<1||value.length>100)return invalid();return value.map(basis);}
function experienceInput(value:unknown):SaveExperience{
 const raw=object(value,['id','expectedVersion','requestId','title','summary','evidence','basis','businessConditions','validUntil','limitations','counterexamples','unknowns','revalidateWhen','status','reason']);
 if(!['active','limited','withdrawn'].includes(raw.status as string))return invalid();
 const revalidate=object(raw.revalidateWhen,['condition','at','sourceIds']);
 return{...(raw.id===undefined?{}:{id:text(raw.id,500)}),expectedVersion:integer(raw.expectedVersion??0,0),requestId:text(raw.requestId,500),title:text(raw.title,500),summary:text(raw.summary),evidence:evidences(raw.evidence,1),basis:bases(raw.basis),businessConditions:strings(raw.businessConditions,1),validUntil:instant(raw.validUntil),limitations:strings(raw.limitations),counterexamples:evidences(raw.counterexamples),unknowns:strings(raw.unknowns),revalidateWhen:{condition:text(revalidate.condition),...(revalidate.at===undefined?{}:{at:instant(revalidate.at)}),...(revalidate.sourceIds===undefined?{}:{sourceIds:strings(revalidate.sourceIds)})},status:raw.status as ExperienceStatus,reason:text(raw.reason)};
}
function useInput(value:unknown):SaveExperienceUse{
 const raw=object(value,['requestId','experience','decision','reason','influence','artifact']);
 if(!['applied','not_applied','unknown'].includes(raw.decision as string))return invalid();const ref=object(raw.experience,['id','version']);
 return{requestId:text(raw.requestId,500),experience:{id:text(ref.id,500),version:integer(ref.version,1)},decision:raw.decision as ExperienceUseDecision,reason:text(raw.reason),influence:text(raw.influence),...(raw.artifact===undefined?{}:{artifact:artifact(raw.artifact)})};
}

/** Same-enterprise reusable business experience; exact sources remain the evidence authority. */
export class ExperienceStore {
 readonly #store:SentiStore;readonly #owner:Owner;readonly #delegationId:string;readonly #namespace:string;readonly #options:ExperienceOptions;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:ExperienceOptions){
  store.scope(scope.owner,scope.delegationId);this.#store=store;this.#owner=Object.freeze({...scope.owner});this.#delegationId=scope.delegationId;this.#namespace=digest([scope.owner.enterpriseId,scope.owner.principalId]);this.#options=options;
  store.connection.exec(`CREATE TABLE IF NOT EXISTS experiences(namespace TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id,version));
   CREATE TABLE IF NOT EXISTS experience_requests(namespace TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,kind TEXT NOT NULL,record_id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(namespace,request_id));
   CREATE TABLE IF NOT EXISTS experience_uses(namespace TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,id));`);
 }
 #now(){return instant(this.#options.now?.()??new Date().toISOString());}
 #requestNamespace(delegationId:string){return digest([this.#namespace,delegationId]);}
 #binding(value:RunBinding):RunBinding{
  if(value?.owner?.enterpriseId!==this.#owner.enterpriseId||value?.owner?.principalId!==this.#owner.principalId||value.delegationId===undefined||value.role!=='main'||!Number.isSafeInteger(value.goalRevision)||value.goalRevision<1||!Number.isSafeInteger(value.epoch)||value.epoch<0||!Number.isSafeInteger(value.generation)||value.generation<1)return invalid();
  return{owner:{...this.#owner},delegationId:value.delegationId,goalRevision:value.goalRevision,epoch:value.epoch,generation:value.generation,role:'main'};
 }
 #current(binding:RunBinding){const delegation=this.#store.scope(this.#owner,binding.delegationId);if(delegation.lifecycle!=='active'||this.#options.isCurrent(binding)!==true)throw new StoreError('experience_stale','经验的当前运行资格已失效。',409);}
 #request(kind:'experience'|'use',delegationId:string,requestId:string,hash:string){const row=this.#store.connection.prepare('SELECT request_hash,kind,record_id,version FROM experience_requests WHERE namespace=? AND request_id=?').get(this.#requestNamespace(delegationId),requestId) as{request_hash:string;kind:string;record_id:string;version:number}|undefined;if(!row)return;if(row.kind!==kind||row.request_hash!==hash)throw new StoreError('experience_conflict','同一经验请求不能改写内容。',409);return row;}
 #history():readonly ExperienceRevision[]{this.#store.scope(this.#owner,this.#delegationId);return this.#store.connection.prepare('SELECT value FROM experiences WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(row=>JSON.parse(row.value as string) as ExperienceRevision);}
 latest():readonly ExperienceRevision[]{return[...new Map(this.#history().map(item=>[item.id,item])).values()];}
 #exact(ref:{id:string;version:number}):ExperienceRevision{const row=this.#store.connection.prepare('SELECT value FROM experiences WHERE namespace=? AND id=? AND version=?').get(this.#namespace,text(ref.id,500),integer(ref.version,1));if(!row)throw new StoreError('experience_not_found','未找到准确经验版本。',404);return JSON.parse(row.value as string) as ExperienceRevision;}
 #allEvidence(item:ExperienceRevision){return[...item.evidence,...item.counterexamples];}
 #qualification(item:ExperienceRevision):ExperienceMeta['qualification']{
  if(!this.#options.evidenceCurrent(this.#allEvidence(item))||!this.#options.evidenceCurrentInDelegation(item.sourceDelegationId,this.#allEvidence(item)))return'unavailable';
  if(item.validUntil<=this.#now())return'expired';return item.version===this.latest().find(current=>current.id===item.id)?.version?'current':'historical';
 }
 meta(item:ExperienceRevision):ExperienceMeta{return{id:item.id,version:item.version,title:item.title,status:item.status,sourceDelegationId:item.sourceDelegationId,createdAt:item.createdAt,validUntil:item.validUntil,qualification:this.#qualification(item)};}
 async save(inputBinding:RunBinding,input:SaveExperience):Promise<ExperienceRevision>{
  const binding=this.#binding(inputBinding),value=experienceInput(input),hash=digest({kind:'experience',sourceDelegationId:binding.delegationId,goalRevision:binding.goalRevision,epoch:binding.epoch,value});
  const prior=this.#request('experience',binding.delegationId,value.requestId,hash);if(prior)return structuredClone(this.#exact({id:prior.record_id,version:prior.version}));
  await this.#options.verifyEvidence(binding,value.evidence);if(value.counterexamples.length)await this.#options.verifyEvidence(binding,value.counterexamples);await this.#options.verifyBasis(binding,value.basis);
  return this.#store.withTransaction(()=>{
   this.#current(binding);const replay=this.#request('experience',binding.delegationId,value.requestId,hash);if(replay)return structuredClone(this.#exact({id:replay.record_id,version:replay.version}));
   const previous=value.id?this.latest().find(item=>item.id===value.id):undefined;if(value.expectedVersion!==(previous?.version??0)||(value.id&&!previous))throw new StoreError('experience_conflict','经验版本已变化，请读取当前版本后修订。',409);
   if(previous&&previous.sourceDelegationId!==binding.delegationId)throw new StoreError('experience_scope','经验修订必须由原来源委托完成。',403);
   const id=value.id??randomUUID(),now=this.#now(),record:ExperienceRevision={...value,id,version:(previous?.version??0)+1,requestId:value.requestId,sourceDelegationId:binding.delegationId,createdAt:now,goalRevision:binding.goalRevision,epoch:binding.epoch,binding,supersedes:previous?{id,version:previous.version}:null};
   this.#store.connection.prepare('INSERT INTO experiences VALUES (?,?,?,?)').run(this.#namespace,id,record.version,JSON.stringify(record));this.#store.connection.prepare('INSERT INTO experience_requests VALUES (?,?,?,?,?,?)').run(this.#requestNamespace(binding.delegationId),value.requestId,hash,'experience',id,record.version);return structuredClone(record);
  });
 }
 async read(inputBinding:RunBinding,ref:{id:string;version:number}):Promise<ExperienceRevision&{qualification:ExperienceMeta['qualification']}>{
  const binding=this.#binding(inputBinding),item=this.#exact(ref);await this.#options.verifyEvidence(binding,this.#allEvidence(item));this.#current(binding);const qualification=this.#qualification(item);if(qualification==='unavailable')throw new StoreError('experience_source_unavailable','经验来源在来源或目标委托当前不可用。',409);return{...structuredClone(item),qualification};
 }
 find():readonly ExperienceMeta[]{return this.latest().map(item=>this.meta(item));}
 async use(inputBinding:RunBinding,input:SaveExperienceUse):Promise<ExperienceUse>{
  const binding=this.#binding(inputBinding),value=useInput(input),hash=digest({kind:'use',targetDelegationId:binding.delegationId,goalRevision:binding.goalRevision,epoch:binding.epoch,value});
  const prior=this.#request('use',binding.delegationId,value.requestId,hash);if(prior)return structuredClone(JSON.parse(this.#store.connection.prepare('SELECT value FROM experience_uses WHERE namespace=? AND id=?').get(this.#namespace,prior.record_id)!.value as string) as ExperienceUse);
  const experience=await this.read(binding,value.experience);if(experience.status==='withdrawn')throw new StoreError('experience_withdrawn','已撤回经验不能作为适用支持。',409);if(experience.qualification!=='current')throw new StoreError('experience_not_applicable','经验过期或非当前版本，不能记录为适用支持。',409);
  if(value.artifact)await this.#options.verifyArtifact(binding,value.artifact);
  return this.#store.withTransaction(()=>{
   this.#current(binding);const replay=this.#request('use',binding.delegationId,value.requestId,hash);if(replay)return structuredClone(JSON.parse(this.#store.connection.prepare('SELECT value FROM experience_uses WHERE namespace=? AND id=?').get(this.#namespace,replay.record_id)!.value as string) as ExperienceUse);
   const id=digest([binding.delegationId,value.experience,value.requestId]),now=this.#now(),record:ExperienceUse={...value,id,targetDelegationId:binding.delegationId,experienceTitle:experience.title,createdAt:now,goalRevision:binding.goalRevision,epoch:binding.epoch,binding};
   this.#store.connection.prepare('INSERT INTO experience_uses VALUES (?,?,?)').run(this.#namespace,id,JSON.stringify(record));this.#store.connection.prepare('INSERT INTO experience_requests VALUES (?,?,?,?,?,?)').run(this.#requestNamespace(binding.delegationId),value.requestId,hash,'use',id,1);return structuredClone(record);
  });
 }
 uses(delegationId:string):readonly ExperienceUse[]{this.#store.scope(this.#owner,delegationId);return this.#store.connection.prepare('SELECT value FROM experience_uses WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(row=>JSON.parse(row.value as string) as ExperienceUse);}
 affectedArtifacts(ref:{id:string;version:number}):readonly ArtifactReference[]{const exact=this.#exact(ref);this.#store.scope(this.#owner,this.#delegationId);const rows=this.#store.connection.prepare('SELECT value FROM experience_uses WHERE namespace=? ORDER BY rowid').all(this.#namespace).map(row=>JSON.parse(row.value as string) as ExperienceUse);return[...new Map(rows.filter(use=>use.experience.id===exact.id&&use.experience.version<=exact.version&&use.artifact).map(use=>[JSON.stringify(use.artifact),use.artifact!])).values()];}
 isExactCurrent(ref:{id:string;version:number}):boolean{try{return this.#qualification(this.#exact(ref))==='current'}catch{return false}}
 projection(delegationId:string){
  this.#store.scope(this.#owner,delegationId);const latest=this.latest();const uses=this.uses(delegationId);const byId=new Map(latest.map(item=>[item.id,item]));
  return{experiences:latest.map(item=>{const meta=this.meta(item);return meta.qualification==='current'?{...meta,summary:item.summary,businessConditions:item.businessConditions,limitations:item.limitations,counterexamples:item.counterexamples,unknowns:item.unknowns,revalidateWhen:item.revalidateWhen}:meta;}),uses:uses.map(use=>{const item=byId.get(use.experience.id);const current=item&&this.#options.evidenceCurrent(this.#allEvidence(item))&&this.#options.evidenceCurrentInDelegation(item.sourceDelegationId,this.#allEvidence(item));return current?use:{id:use.id,experience:use.experience,decision:use.decision,targetDelegationId:use.targetDelegationId,createdAt:use.createdAt,qualification:'unavailable'};}),history:this.#history().map(item=>this.meta(item))};
 }
}
