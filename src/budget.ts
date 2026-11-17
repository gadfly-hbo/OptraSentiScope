import {createHash} from 'node:crypto';
import type {SentiStore} from './store.ts';
import type {Owner} from './domain.ts';
import {StoreError} from './domain.ts';
import type {TokenUsage} from '@deepseek-ai/dsh-llm';
import type {RunBinding} from '../runtime/index.ts';

export interface BudgetUnits {modelRequests:number;outputTokens:number;computeMilliseconds:number;}
export interface BudgetConfig {revision:number;limits:BudgetUnits;expiresAt:string;}
export interface BudgetRequest {id:string;kind:'model'|'compute';units:BudgetUnits;binding:RunBinding;}
export type BudgetReservationState='reserved'|'dispatched'|'settled'|'unknown'|'released';
export interface BudgetSettlement {receiptId:string;actual:BudgetUnits;usage?:Readonly<TokenUsage>;}
export interface BudgetReservation extends BudgetRequest {state:BudgetReservationState;configRevision:number;createdAt:string;updatedAt:string;receiptId?:string;actual?:BudgetUnits;usage?:Readonly<TokenUsage>;unknownReason?:string;overrun?:boolean;}
interface Policy {config:BudgetConfig;used:BudgetUnits;held:BudgetUnits;overrun:boolean;accountingOverflow:boolean;}
const keys=['modelRequests','outputTokens','computeMilliseconds'] as const;
const zero=():BudgetUnits=>({modelRequests:0,outputTokens:0,computeMilliseconds:0});
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const units=(value:BudgetUnits):BudgetUnits=>{
  if(!value||typeof value!=='object'||keys.some(key=>!Number.isSafeInteger(value[key])||value[key]<0)||Object.keys(value).some(key=>!keys.includes(key as typeof keys[number])))throw new StoreError('invalid_budget','资源计量须为有限非负安全整数。');
  return {modelRequests:value.modelRequests,outputTokens:value.outputTokens,computeMilliseconds:value.computeMilliseconds};
};
const text=(value:string)=>{if(typeof value!=='string'||!value||value.length>256)throw new StoreError('invalid_budget','预算记录标识无效。');return value;};
const instant=(value:string)=>{const time=Date.parse(value);if(!Number.isFinite(time))throw new StoreError('invalid_budget','预算时间无效。');return new Date(time).toISOString();};

/** Host-owned resource accounting. Never interprets research methods or creates a native run. */
export class BudgetStore {
  readonly #store:SentiStore;
  readonly #scope:{owner:Owner;delegationId:string};
  readonly #namespace:string;
  readonly #options:{isCurrent(binding:RunBinding):boolean;now?:()=>string};
  constructor(store:SentiStore,scope:{owner:Owner;delegationId:string},options:{isCurrent(binding:RunBinding):boolean;now?:()=>string}) {
    store.scope(scope.owner,scope.delegationId);this.#store=store;this.#scope={owner:Object.freeze({...scope.owner}),delegationId:scope.delegationId};this.#options=options;
    this.#namespace=hash([scope.owner.enterpriseId,scope.owner.principalId,scope.delegationId]);
    store.connection.exec(`CREATE TABLE IF NOT EXISTS resource_budget_policies(namespace TEXT PRIMARY KEY,delegation_id TEXT NOT NULL REFERENCES delegations(id),value TEXT NOT NULL CHECK(json_valid(value)));
      CREATE TABLE IF NOT EXISTS resource_budget_reservations(namespace TEXT NOT NULL,id TEXT NOT NULL,request_hash TEXT NOT NULL,state TEXT NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)),PRIMARY KEY(namespace,id));
      CREATE UNIQUE INDEX IF NOT EXISTS resource_budget_receipt_unique ON resource_budget_reservations(namespace,json_extract(value,'$.receiptId')) WHERE json_extract(value,'$.receiptId') IS NOT NULL;
      CREATE INDEX IF NOT EXISTS resource_budget_unsettled ON resource_budget_reservations(namespace,state);
      CREATE TABLE IF NOT EXISTS resource_budget_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,namespace TEXT NOT NULL,reservation_id TEXT,at TEXT NOT NULL,detail TEXT NOT NULL CHECK(json_valid(detail)));`);
  }
  #now() {return instant(this.#options.now?.()??new Date().toISOString());}
  #policy():Policy|undefined {const row=this.#store.connection.prepare('SELECT value FROM resource_budget_policies WHERE namespace=?').get(this.#namespace);return row?JSON.parse(row.value as string) as Policy:undefined;}
  #save(policy:Policy) {this.#store.connection.prepare('INSERT INTO resource_budget_policies VALUES (?,?,?) ON CONFLICT(namespace) DO UPDATE SET value=excluded.value').run(this.#namespace,this.#scope.delegationId,JSON.stringify(policy));}
  #event(id:string|null,detail:unknown) {this.#store.connection.prepare('INSERT INTO resource_budget_events(namespace,reservation_id,at,detail) VALUES (?,?,?,?)').run(this.#namespace,id,this.#now(),JSON.stringify(detail));}
  #record(record:BudgetReservation,requestHash?:string) {
    if(requestHash)this.#store.connection.prepare('INSERT INTO resource_budget_reservations VALUES (?,?,?,?,?)').run(this.#namespace,record.id,requestHash,record.state,JSON.stringify(record));
    else this.#store.connection.prepare('UPDATE resource_budget_reservations SET state=?,value=? WHERE namespace=? AND id=?').run(record.state,JSON.stringify(record),this.#namespace,record.id);
  }
  #binding(input:RunBinding):RunBinding {
    if(!input||input.owner?.enterpriseId!==this.#scope.owner.enterpriseId||input.owner?.principalId!==this.#scope.owner.principalId||input.delegationId!==this.#scope.delegationId)throw new StoreError('budget_scope','资源预约不属于当前委托。',403);
    if(!Number.isSafeInteger(input.goalRevision)||input.goalRevision<1||!Number.isSafeInteger(input.epoch)||input.epoch<0||!Number.isSafeInteger(input.generation)||input.generation<1||!['main','worker'].includes(input.role))throw new StoreError('invalid_budget','资源运行绑定无效。');
    return {owner:{...this.#scope.owner},delegationId:input.delegationId,goalRevision:input.goalRevision,epoch:input.epoch,generation:input.generation,role:input.role,...(input.assignmentId?{assignmentId:text(input.assignmentId)}:{})};
  }
  #current(binding:RunBinding) {
    const d=this.#store.scope(this.#scope.owner,this.#scope.delegationId);let qualified=false;try{qualified=this.#options.isCurrent(binding)===true;}catch{/* Qualification errors cannot grant resources. */}
    if(d.lifecycle!=='active'||d.goalRevision!==binding.goalRevision||!qualified)throw new StoreError('budget_binding_stale','当前运行资格不允许派发资源。',409);
  }
  get(id:string):BudgetReservation|undefined {this.#store.scope(this.#scope.owner,this.#scope.delegationId);const row=this.#store.connection.prepare('SELECT value FROM resource_budget_reservations WHERE namespace=? AND id=?').get(this.#namespace,text(id));return row?JSON.parse(row.value as string) as BudgetReservation:undefined;}
  configure(input:BudgetConfig):void {
    const config={revision:input.revision,limits:units(input.limits),expiresAt:instant(input.expiresAt)};
    if(!Number.isSafeInteger(config.revision)||config.revision<1)throw new StoreError('invalid_budget','预算修订须为正安全整数。');
    this.#store.withTransaction(()=>{
      this.#store.scope(this.#scope.owner,this.#scope.delegationId);const previous=this.#policy();
      if(previous?.config.revision===config.revision){if(hash(previous.config)!==hash(config))throw new StoreError('budget_revision_conflict','同一预算修订不能改写配置。',409);return;}
      if(previous&&previous.config.revision>config.revision)throw new StoreError('budget_revision_conflict','预算配置修订已过期。',409);
      this.#save({config,used:previous?.used??zero(),held:previous?.held??zero(),overrun:previous?.overrun??false,accountingOverflow:previous?.accountingOverflow??false});this.#event(null,{kind:'configured',revision:config.revision});
    });
  }
  snapshot() {
    this.#store.scope(this.#scope.owner,this.#scope.delegationId);const p=this.#policy();
    if(!p)return {status:'unconfigured' as const,config:null,used:zero(),held:zero(),remaining:zero(),expired:false,overrun:false,accountingOverflow:false,unknownCount:0,available:{model:false,compute:false},exhausted:true};
    const remaining=zero();for(const key of keys)remaining[key]=Math.max(0,p.config.limits[key]-p.used[key]-p.held[key]);
    const expired=this.#now()>=p.config.expiresAt;const blocked=expired||p.overrun||p.accountingOverflow;
    const available={model:!blocked&&remaining.modelRequests>0&&remaining.outputTokens>0,compute:!blocked&&remaining.computeMilliseconds>0};
    const unknownCount=Number(this.#store.connection.prepare("SELECT COUNT(*) AS total FROM resource_budget_reservations WHERE namespace=? AND state='unknown'").get(this.#namespace)?.total??0);
    return {status:available.model||available.compute?'available' as const:'exhausted' as const,config:p.config,used:p.used,held:p.held,remaining,expired,overrun:p.overrun,accountingOverflow:p.accountingOverflow,unknownCount,available,exhausted:!available.model&&!available.compute};
  }
  dispatch(id:string):BudgetReservation {
    return this.#store.withTransaction(()=>{
      const r=this.get(id);if(!r)throw new StoreError('budget_not_found','资源预约不存在。',404);
      if(r.state!=='reserved')throw new StoreError('budget_dispatch_uncertain','资源预约已派发或已收束，不能再次派发。',409);
      this.#current(r.binding);const p=this.#policy()!;
      if(this.#now()>=p.config.expiresAt||p.overrun||p.accountingOverflow||keys.some(k=>p.used[k]+p.held[k]>p.config.limits[k]))throw new StoreError('budget_exhausted','当前预算不允许派发。',409);
      r.state='dispatched';r.updatedAt=this.#now();this.#record(r);this.#event(r.id,{kind:'dispatched'});return structuredClone(r);
    });
  }
  settle(id:string,input:BudgetSettlement):BudgetReservation {
    const actual=units(input.actual),receiptId=text(input.receiptId);let usage:TokenUsage|undefined;
    if(input.usage!==undefined){
      const raw=input.usage;const fields=['inputTokens','outputTokens','totalTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'] as const;
      if(!raw||typeof raw!=='object'||!Number.isSafeInteger(raw.inputTokens)||!Number.isSafeInteger(raw.outputTokens)||raw.inputTokens<0||raw.outputTokens<0||Object.keys(raw).some(k=>!fields.includes(k as typeof fields[number]))||fields.some(k=>raw[k]!==undefined&&(!Number.isSafeInteger(raw[k])||raw[k]!<0))||raw.outputTokens!==actual.outputTokens||(raw.reasoningTokens!==undefined&&raw.reasoningTokens>raw.outputTokens))throw new StoreError('invalid_budget_usage','原生用量回执无效，不能按零用量结算。');
      usage={inputTokens:raw.inputTokens,outputTokens:raw.outputTokens};for(const k of fields)if(raw[k]!==undefined)usage[k]=raw[k];
    }
    const receipt={receiptId,actual,...(usage?{usage}:{})};
    return this.#store.withTransaction(()=>{
      const r=this.get(id);if(!r)throw new StoreError('budget_not_found','资源预约不存在。',404);
      const prior=this.#store.connection.prepare("SELECT id FROM resource_budget_reservations WHERE namespace=? AND json_extract(value,'$.receiptId')=?").get(this.#namespace,receiptId);
      if(prior&&prior.id!==id)throw new StoreError('budget_receipt_conflict','该原生回执已绑定其他预约。',409);
      if(r.state==='settled'){
        if(hash({receiptId:r.receiptId,actual:r.actual,...(r.usage?{usage:r.usage}:{})})!==hash(receipt))throw new StoreError('budget_receipt_conflict','已确认资源回执不能改写。',409);
        return r;
      }
      if(!['dispatched','unknown'].includes(r.state))throw new StoreError('budget_receipt_state','该预约尚未派发或已释放。',409);
      if(r.kind==='model'?(actual.modelRequests!==1||actual.computeMilliseconds!==0):actual.modelRequests!==0||actual.outputTokens!==0||usage!==undefined)throw new StoreError('invalid_budget_usage','实际计量与资源类型不匹配。');
      const p=this.#policy()!;r.overrun=keys.some(k=>actual[k]>r.units[k]);
      for(const key of keys){
        p.held[key]-=r.units[key];const sum=BigInt(p.used[key])+BigInt(actual[key]);
        if(sum>BigInt(Number.MAX_SAFE_INTEGER)){p.used[key]=Number.MAX_SAFE_INTEGER;p.accountingOverflow=true;}else p.used[key]=Number(sum);
      }
      p.overrun||=r.overrun||p.accountingOverflow;this.#save(p);r.state='settled';r.updatedAt=this.#now();Object.assign(r,receipt);this.#record(r);this.#event(r.id,{kind:'settled',receiptId,actual,overrun:r.overrun,accountingOverflow:p.accountingOverflow});return structuredClone(r);
    });
  }
  markUnknown(id:string,reason:string):BudgetReservation {return this.#store.withTransaction(()=>{const r=this.get(id);if(!r)throw new StoreError('budget_not_found','资源预约不存在。',404);if(['settled','released','unknown'].includes(r.state))return r;r.state='unknown';r.unknownReason=text(reason);r.updatedAt=this.#now();this.#record(r);this.#event(r.id,{kind:'unknown',reason});return r;});}
  unknown(id:string,reason:string):BudgetReservation {return this.markUnknown(id,reason);}
  releaseUndispatched(id:string):BudgetReservation {return this.#store.withTransaction(()=>{const r=this.get(id);if(!r)throw new StoreError('budget_not_found','资源预约不存在。',404);if(r.state==='released')return r;if(r.state!=='reserved')throw new StoreError('budget_release_uncertain','已派发或未知的资源不能释放预约。',409);const p=this.#policy()!;for(const k of keys)p.held[k]-=r.units[k];this.#save(p);r.state='released';r.updatedAt=this.#now();this.#record(r);this.#event(r.id,{kind:'released'});return structuredClone(r);});}
  reserve(input:BudgetRequest):BudgetReservation {
    const request={id:text(input.id),kind:input.kind,units:units(input.units),binding:this.#binding(input.binding)};
    if(request.kind==='model'?(request.units.modelRequests!==1||request.units.outputTokens<1||request.units.computeMilliseconds!==0):request.kind==='compute'?(request.units.modelRequests!==0||request.units.outputTokens!==0||request.units.computeMilliseconds<1):true)throw new StoreError('invalid_budget','资源预约与执行类型不匹配。');
    return this.#store.withTransaction(()=>{
      const previous=this.#store.connection.prepare('SELECT value,request_hash FROM resource_budget_reservations WHERE namespace=? AND id=?').get(this.#namespace,request.id);
      if(previous){if(previous.request_hash!==hash(request))throw new StoreError('budget_request_conflict','同一资源请求不能改写预约。',409);return JSON.parse(previous.value as string) as BudgetReservation;}
      this.#current(request.binding);const p=this.#policy();if(!p)throw new StoreError('budget_unconfigured','尚未配置委托资源预算。',409);
      if(this.#now()>=p.config.expiresAt||p.overrun||p.accountingOverflow||keys.some(key=>request.units[key]>p.config.limits[key]-p.used[key]-p.held[key]))throw new StoreError('budget_exhausted','委托资源预算不足或已到期；没有派发。',409);
      for(const key of keys)p.held[key]+=request.units[key];this.#save(p);const at=this.#now();const reservation={...request,state:'reserved' as const,configRevision:p.config.revision,createdAt:at,updatedAt:at};this.#record(reservation,hash(request));this.#event(request.id,{kind:'reserved',units:request.units});return structuredClone(reservation);
    });
  }
}
