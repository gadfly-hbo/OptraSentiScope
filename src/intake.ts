import {createHash} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';
import type {RunBinding} from '../runtime/index.ts';

export type IntakeQuestionStatus='pending'|'resolved'|'withdrawn';
export interface IntakeQuestion {
 id:string;question:string;impact:string;blockingScopes:readonly string[];status:IntakeQuestionStatus;answer?:string;
}
export interface IntakeContent {
 objective:string;facts:readonly string[];assumptions:readonly string[];reusableExperiences:readonly {id:string;version:number;applicable:boolean;reason:string}[];
 researchAuthorization:readonly string[];businessBoundary:readonly string[];evaluation:readonly string[];followUp:readonly string[];
 unknowns:readonly string[];questions:readonly IntakeQuestion[];
}
export interface SaveIntakeSummary {requestId:string;expectedRevision:number;reason:string;content:IntakeContent;}
export interface IntakeRevision extends Omit<SaveIntakeSummary,'expectedRevision'> {
 id:string;revision:number;createdAt:string;goalRevision:number;epoch:number;actor:{role:'main';generation:number};supersedes:{id:string;revision:number}|null;
}
export interface IntakeOptions {isCurrent(binding:RunBinding):boolean;now?():string;}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function invalid():never{throw new StoreError('intake_invalid','委托摘要字段或准确版本无效。');}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))return invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=20000):string{if(typeof value!=='string'||!value.trim()||value.length>max)return invalid();return value.trim();}
function strings(value:unknown):readonly string[]{if(!Array.isArray(value)||value.length>100)return invalid();return value.map(item=>text(item));}
function question(value:unknown):IntakeQuestion{
 const raw=object(value,['id','question','impact','blockingScopes','status','answer']);if(!['pending','resolved','withdrawn'].includes(raw.status as string))return invalid();
 return{id:text(raw.id,500),question:text(raw.question),impact:text(raw.impact),blockingScopes:strings(raw.blockingScopes),status:raw.status as IntakeQuestionStatus,...(raw.answer===undefined?{}:{answer:text(raw.answer)})};
}
function content(value:unknown):IntakeContent{
 const raw=object(value,['objective','facts','assumptions','reusableExperiences','researchAuthorization','businessBoundary','evaluation','followUp','unknowns','questions']);
 if(!Array.isArray(raw.reusableExperiences)||raw.reusableExperiences.length>100)return invalid();
 const experiences=raw.reusableExperiences.map(item=>{const experience=object(item,['id','version','applicable','reason']);return{id:text(experience.id,500),version:Number(experience.version),applicable:experience.applicable===true,reason:text(experience.reason)};}).filter(item=>Number.isSafeInteger(item.version)&&item.version>0&&typeof item.applicable==='boolean'?true:false);
 if(experiences.length!==raw.reusableExperiences.length)return invalid();
 if(!Array.isArray(raw.questions)||raw.questions.length>50)return invalid();
 return{objective:text(raw.objective),facts:strings(raw.facts),assumptions:strings(raw.assumptions),reusableExperiences:experiences,researchAuthorization:strings(raw.researchAuthorization),businessBoundary:strings(raw.businessBoundary),evaluation:strings(raw.evaluation),followUp:strings(raw.followUp),unknowns:strings(raw.unknowns),questions:raw.questions.map(question)};
}
function input(value:unknown):SaveIntakeSummary{const raw=object(value,['requestId','expectedRevision','reason','content']);const expected=raw.expectedRevision;return{requestId:text(raw.requestId,500),expectedRevision:Number.isSafeInteger(expected)&&Number(expected)>=0?Number(expected):invalid(),reason:text(raw.reason),content:content(raw.content)};}

/** Versioned background intake facts. No source authority, Agent runtime, ticket or timer. */
export class IntakeStore {
 readonly #store:SentiStore;readonly #owner:Owner;readonly #delegationId:string;readonly #options:IntakeOptions;
 constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:IntakeOptions){store.scope(scope.owner,scope.delegationId);this.#store=store;this.#owner=Object.freeze({...scope.owner});this.#delegationId=scope.delegationId;this.#options=options;store.connection.exec(`CREATE TABLE IF NOT EXISTS intake_summaries(delegation_id TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(delegation_id,id,revision));CREATE TABLE IF NOT EXISTS intake_requests(delegation_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(delegation_id,request_id));`);}
 #now(){return this.#options.now?.()??new Date().toISOString();}
 #binding(value:RunBinding):RunBinding{if(value?.owner?.enterpriseId!==this.#owner.enterpriseId||value?.owner?.principalId!==this.#owner.principalId||value.delegationId!==this.#delegationId||value.role!=='main'||!Number.isSafeInteger(value.goalRevision)||value.goalRevision<1||!Number.isSafeInteger(value.epoch)||value.epoch<0||!Number.isSafeInteger(value.generation)||value.generation<1)return invalid();return{owner:{...this.#owner},delegationId:this.#delegationId,goalRevision:value.goalRevision,epoch:value.epoch,generation:value.generation,role:'main'};}
 #current(binding:RunBinding){const delegation=this.#store.scope(this.#owner,this.#delegationId);if(delegation.lifecycle!=='active'||delegation.goalRevision!==binding.goalRevision||this.#options.isCurrent(binding)!==true)throw new StoreError('intake_stale','委托摘要的当前运行资格已失效。',409);}
 history():readonly IntakeRevision[]{this.#store.scope(this.#owner,this.#delegationId);return this.#store.connection.prepare('SELECT value FROM intake_summaries WHERE delegation_id=? ORDER BY rowid').all(this.#delegationId).map(row=>JSON.parse(row.value as string) as IntakeRevision);}
 latest():IntakeRevision|undefined{return this.history().at(-1);}
 #required(id:string,revision:number):IntakeRevision{const row=this.#store.connection.prepare('SELECT value FROM intake_summaries WHERE delegation_id=? AND id=? AND revision=?').get(this.#delegationId,text(id,500),revision);if(!row)throw new StoreError('intake_not_found','未找到准确委托摘要版本。',404);return JSON.parse(row.value as string) as IntakeRevision;}
 #request(requestId:string,hash:string){const row=this.#store.connection.prepare('SELECT request_hash,id,revision FROM intake_requests WHERE delegation_id=? AND request_id=?').get(this.#delegationId,requestId) as{request_hash:string;id:string;revision:number}|undefined;if(!row)return;if(row.request_hash!==hash)throw new StoreError('intake_conflict','同一委托摘要请求不能改写内容。',409);return row;}
 save(inputBinding:RunBinding,raw:SaveIntakeSummary):IntakeRevision{
  const binding=this.#binding(inputBinding),value=input(raw),hash=digest({goalRevision:binding.goalRevision,epoch:binding.epoch,value});
  const prior=this.#request(value.requestId,hash);if(prior)return structuredClone(this.#required(prior.id,prior.revision));
  return this.#store.withTransaction(()=>{
   this.#current(binding);const replay=this.#request(value.requestId,hash);if(replay)return structuredClone(this.#required(replay.id,replay.revision));
   const latest=this.latest();if(value.expectedRevision!==(latest?.revision??0))throw new StoreError('intake_conflict','委托摘要已有新版本，请读取当前版本后修订。',409);
   const id=latest?.id??'intake',revision=(latest?.revision??0)+1,record:IntakeRevision={requestId:value.requestId,reason:value.reason,content:value.content,id,revision,createdAt:this.#now(),goalRevision:binding.goalRevision,epoch:binding.epoch,actor:{role:'main',generation:binding.generation},supersedes:latest?{id,revision:latest.revision}:null};
   this.#store.connection.prepare('INSERT INTO intake_summaries VALUES (?,?,?,?)').run(this.#delegationId,id,revision,JSON.stringify(record));this.#store.connection.prepare('INSERT INTO intake_requests VALUES (?,?,?,?,?)').run(this.#delegationId,value.requestId,hash,id,revision);return structuredClone(record);
  });
 }
 projection(binding:RunBinding){
  this.#store.scope(this.#owner,this.#delegationId);const latest=this.latest();if(!latest)return{summary:null,pendingQuestions:[],status:'not_started'};
  const current=latest.goalRevision===binding.goalRevision&&latest.epoch===binding.epoch;
  if(!current)return{summary:{id:latest.id,revision:latest.revision,createdAt:latest.createdAt,goalRevision:latest.goalRevision,epoch:latest.epoch,qualification:'historical'},pendingQuestions:[],status:'recheck_required'};
  return{summary:{...structuredClone(latest),qualification:'current'},pendingQuestions:latest.content.questions.filter(question=>question.status==='pending'),status:'current'};
 }
}
