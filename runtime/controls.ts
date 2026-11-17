import{deadline,MAX_TIMER_DELAY_MS,timeoutOf}from'@deepseek-ai/dsh-timeout';
import type{Deadline}from'@deepseek-ai/dsh-timeout';
import{randomUUID}from'node:crypto';
import type{GenerateOptions,StreamChunk,TokenUsage}from'@deepseek-ai/dsh-llm';
import{LLM_FAILURE_CODES}from'@deepseek-ai/dsh-llm';
import type{NativeFact,RunBinding}from'./index.ts';
import{StoreError}from'../src/domain.ts';
import type{Owner}from'../src/domain.ts';
import type{SentiStore}from'../src/store.ts';
import{BudgetStore}from'../src/budget.ts';
import type{BudgetConfig}from'../src/budget.ts';
import{HostCredentials}from'../src/credentials.ts';
import type{CredentialGrant,CredentialRecordsPort,CredentialUseBinding}from'../src/credentials.ts';
import{HostEgress}from'../src/egress.ts';
import type{ModelEgressGrant}from'../src/egress.ts';
import{createClosedComputePort}from'../src/compute.ts';

export interface LocalModelRoute {readonly provider:string;readonly model:string;}
export interface HostDefaults {budget?:{limits:BudgetConfig['limits'];durationMs:number};modelEgress?:Omit<ModelEgressGrant,'revision'>;credentials?:readonly Omit<CredentialGrant,'owner'|'delegationId'>[];}
export interface HostControlOptions {
 defaults?:HostDefaults;
 store:SentiStore;owner:Owner;credentialRecords:CredentialRecordsPort;
 isCurrent(binding:RunBinding):boolean;
 verifyInput(binding:RunBinding):Promise<void>;
 halt(binding:RunBinding,code:string):void;
 changed?(id:string):void;
 /** Trusted in-process engineering adapters only. Product JSON cannot declare an external route local. */
 localModelRoutes?:readonly LocalModelRoute[];
 modelSelection?:{provider:string;model:string;maxTokens?:number};
}
const codes=new Set(['budget_exhausted','budget_expired','budget_unconfigured','budget_binding_stale','budget_deadline_unsupported','budget_usage_invalid','invalid_budget_usage','budget_dispatch_uncertain','egress_denied','egress_changed','stale_egress_binding','credential_unavailable','credential_revoked','credential_stale','credential_unqualified','credential_missing']);
const safeCode=(error:unknown)=>error instanceof StoreError&&codes.has(error.code)?error.code:'host_resource_unconfirmed';
const validUsage=(usage:TokenUsage)=>usage&&Object.keys(usage).every(k=>['inputTokens','outputTokens','totalTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'].includes(k))&&[usage.inputTokens,usage.outputTokens,...[usage.totalTokens,usage.cacheReadTokens,usage.cacheWriteTokens,usage.reasoningTokens].filter(v=>v!==undefined)].every(v=>Number.isSafeInteger(v)&&v>=0);
function safeFailure(chunk:StreamChunk):StreamChunk {
 if(chunk.type!=='finish'||!['error','aborted'].includes(chunk.reason.kind))return chunk;
 const reason=chunk.reason as Extract<typeof chunk.reason,{kind:'error'|'aborted'}>,failure=reason.failure;
 const code=Object.hasOwn(LLM_FAILURE_CODES,failure.code)||/^HTTP_[1-5]\d\d$/.test(failure.code)?failure.code:'UNKNOWN';
 return {type:'finish',reason:{kind:reason.kind,failure:{code,message:'模型调用未完成；请由 Host 管理员核对安全诊断代码。',
  ...(Number.isSafeInteger(failure.status)&&failure.status!>=100&&failure.status!<=599?{status:failure.status}:{}),
  ...(Number.isSafeInteger(failure.providerRetryAfterMs)&&failure.providerRetryAfterMs!>=0&&failure.providerRetryAfterMs!<=MAX_TIMER_DELAY_MS?{providerRetryAfterMs:failure.providerRetryAfterMs}:{}),
  ...(code==='IMAGE_OFFLOAD_REQUIRED'&&Number.isSafeInteger(failure.offloadImages)&&failure.offloadImages!>0?{offloadImages:failure.offloadImages}:{})}}};
}

/** Host governance around the public llm/stream seam. No model loop, retry, secret store or computation fallback. */
export class HostControls {
 readonly #o:HostControlOptions;readonly #budgets=new Map<string,BudgetStore>();readonly #routes:Set<string>;
 readonly credentials:HostCredentials;readonly egress:HostEgress;readonly compute:ReturnType<typeof createClosedComputePort>;
 #closed=false;
 readonly #active=new Map<string,{fact:NativeFact;credential?:CredentialUseBinding;deadlineAt:number;rearm(at:number):void;stop(code:string):void}>();
 constructor(options:HostControlOptions){this.#o={...options,owner:Object.freeze({...options.owner})};this.#routes=new Set((options.localModelRoutes??[]).map(r=>JSON.stringify([r.provider,r.model])));
  options.store.connection.exec('CREATE TABLE IF NOT EXISTS host_resource_blocks (enterprise_id TEXT NOT NULL,principal_id TEXT NOT NULL,delegation_id TEXT NOT NULL,code TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(enterprise_id,principal_id,delegation_id))');
  this.egress=new HostEgress(options.store,{owner:options.owner,isCurrent:b=>!this.#closed&&options.isCurrent(b)});
  this.compute=createClosedComputePort({admit:b=>!this.#closed&&options.isCurrent(b)});
  this.credentials=new HostCredentials(options.store,options.credentialRecords,{owner:options.owner,isCurrent:b=>!this.#closed&&b.owner.enterpriseId===options.owner.enterpriseId&&b.owner.principalId===options.owner.principalId&&options.store.scope(options.owner,b.delegationId).lifecycle==='active'});
 }
 ensureDefaults(id:string):void {this.#o.store.scope(this.#o.owner,id);const defaults=this.#o.defaults;if(!defaults)return;
  if(defaults.budget&&this.budget(id).snapshot().status==='unconfigured'){if(!Number.isSafeInteger(defaults.budget.durationMs)||defaults.budget.durationMs<1||defaults.budget.durationMs>MAX_TIMER_DELAY_MS)throw new StoreError('invalid_budget','默认预算期限无效。');this.budget(id).configure({revision:1,limits:defaults.budget.limits,expiresAt:new Date(Date.now()+defaults.budget.durationMs).toISOString()});}
  if(defaults.modelEgress&&this.egress.snapshot(id).model.status==='unconfigured')this.egress.configure(id,{...defaults.modelEgress,revision:1});
  if(defaults.credentials?.length){const all=this.credentials.listGrants();const fresh=defaults.credentials.filter(g=>!all.some(old=>old.delegationId===id&&old.ref===g.ref)).map(g=>({...g,owner:this.#o.owner,delegationId:id}));if(fresh.length)this.credentials.configure([...all,...fresh]);}
 }
 budget(id:string):BudgetStore {this.#o.store.scope(this.#o.owner,id);let found=this.#budgets.get(id);if(!found){found=new BudgetStore(this.#o.store,{owner:this.#o.owner,delegationId:id},{isCurrent:b=>!this.#closed&&this.#o.isCurrent(b)});this.#budgets.set(id,found);}return found;}
 #clear(id:string){this.#o.store.connection.prepare('DELETE FROM host_resource_blocks WHERE enterprise_id=? AND principal_id=? AND delegation_id=?').run(this.#o.owner.enterpriseId,this.#o.owner.principalId,id);}
 refresh(id:string):void {this.#o.store.scope(this.#o.owner,id);this.#clear(id);this.#o.changed?.(id);}
 #blocked(id:string){const row=this.#o.store.connection.prepare('SELECT code FROM host_resource_blocks WHERE enterprise_id=? AND principal_id=? AND delegation_id=?').get(this.#o.owner.enterpriseId,this.#o.owner.principalId,id);if(row?.code==='budget_exhausted'&&this.#rawCanStart(id)){this.#clear(id);return undefined;}return row?.code as string|undefined;}
 #enforceActive(id:string):void {const snap=this.budget(id).snapshot();for(const op of this.#active.values())if(op.fact.binding.delegationId===id){if(snap.expired||snap.overrun||snap.accountingOverflow||snap.config&&(['modelRequests','outputTokens','computeMilliseconds'] as const).some(k=>snap.used[k]+snap.held[k]>snap.config!.limits[k]))op.stop(snap.expired?'budget_expired':'budget_exhausted');else if(snap.config&&Date.parse(snap.config.expiresAt)<op.deadlineAt)op.rearm(Date.parse(snap.config.expiresAt));}}
 configureBudget(id:string,config:BudgetConfig):void {this.budget(id).configure(config);this.#clear(id);this.#enforceActive(id);this.#o.changed?.(id);}
 configureModelEgress(id:string,grant:ModelEgressGrant):void {const prior=this.egress.snapshot(id).model.revision;this.egress.configure(id,grant);this.#clear(id);if(prior!==grant.revision)for(const op of this.#active.values())if(op.fact.binding.delegationId===id)op.stop('egress_changed');this.#o.changed?.(id);}
 configureCredentials(grants:readonly CredentialGrant[]):void {this.credentials.configure(grants);for(const op of this.#active.values())if(op.credential)try{this.credentials.assertAuthorized(op.credential);}catch{op.stop('credential_revoked');}for(const d of this.#o.store.list(this.#o.owner)){this.#clear(d.id);this.#o.changed?.(d.id);}}
 #rawCanStart(id:string):boolean {const b=this.budget(id).snapshot(),e=this.egress.snapshot(id);return !this.#closed&&b.status!=='unconfigured'&&!b.expired&&!b.overrun&&!b.accountingOverflow&&b.available.model&&e.model.status==='configured'&&Number.isSafeInteger(this.#o.modelSelection?.maxTokens)&&b.remaining.outputTokens>=(this.#o.modelSelection?.maxTokens??Infinity)&&this.#routes.has(JSON.stringify([this.#o.modelSelection?.provider,this.#o.modelSelection?.model]));}
 canStart(id:string):boolean {return !this.#blocked(id)&&this.#rawCanStart(id);}
 snapshot(id:string){const b=this.budget(id).snapshot(),e=this.egress.snapshot(id),activeModelRequests=[...this.#active.values()].filter(x=>x.fact.binding.delegationId===id).length;return {budget:b,egress:e,compute:{status:'unavailable',reason:'isolation_unconfigured'},activeModelRequests,modelDispatch:this.canStart(id)?'eligible':'waiting_resources',block:this.#blocked(id)??null};}
 #check(binding:RunBinding){if(this.#closed||!this.#o.isCurrent(binding))throw new StoreError('stale_egress_binding','当前运行资格已失效；未发送后续资料。',409);}
 async *stream(fact:NativeFact,request:GenerateOptions,next:()=>AsyncIterable<StreamChunk>):AsyncIterable<StreamChunk>{
  const b=fact.binding;let reservation:string|undefined;let dispatched=false;let usage:TokenUsage|undefined;let finished=false;let usageInvalid=false;let credential:CredentialUseBinding|undefined;let timer:Deadline|undefined;let onDeadline:(()=>void)|undefined;let blocked:StoreError|undefined;
  const stop=(code:string)=>{if(blocked)return;blocked=new StoreError(code,'Host 资源或资料出口已失去资格；仅保留旧请求的资源回执。',409);if(this.#o.isCurrent(b))this.#o.store.connection.prepare('INSERT INTO host_resource_blocks VALUES (?,?,?,?,?) ON CONFLICT(enterprise_id,principal_id,delegation_id) DO UPDATE SET code=excluded.code,at=excluded.at').run(this.#o.owner.enterpriseId,this.#o.owner.principalId,b.delegationId,code,new Date().toISOString());this.#o.halt(b,code);};
  const arm=(at:number)=>{if(timer){if(onDeadline)timer.signal.removeEventListener('abort',onDeadline);timer[Symbol.dispose]();}const remaining=at-Date.now();if(remaining<=0){stop('budget_expired');return;}if(remaining>MAX_TIMER_DELAY_MS){stop('budget_deadline_unsupported');return;}timer=deadline(request.signal,remaining,'host_budget_expired');onDeadline=()=>{if(timer&&timeoutOf(timer.signal,'host_budget_expired'))stop('budget_expired');};timer.signal.addEventListener('abort',onDeadline,{once:true});if(reservation){const op=this.#active.get(reservation);if(op)op.deadlineAt=at;}};
  try {
   this.#check(b);if(request.sessionId!==fact.sessionId)throw new StoreError('egress_denied','模型请求不属于当前原生会话。',403);
   const receipt=this.egress.authorize(b,{channel:'model',provider:request.provider,model:request.model,maxTokens:request.maxTokens});
   if(!this.#routes.has(JSON.stringify([request.provider,request.model])))throw new StoreError('egress_denied','当前没有获准的本地工程模型出口；真实模型调用尚未启用。',403);
   await this.#o.verifyInput(b);this.#check(b);this.egress.recheck(b,receipt);
   if(receipt.credential){credential={owner:b.owner,delegationId:b.delegationId,provider:request.provider,purpose:'model',...receipt.credential};const status=await this.credentials.describe(credential);if(status.status!=='ready')throw new StoreError('credential_unavailable','模型凭据未就绪；未发送资料。',409);}
   this.#check(b);this.egress.recheck(b,receipt);
   const budget=this.budget(b.delegationId),snapshot=budget.snapshot();const duration=Date.parse(snapshot.config?.expiresAt??'')-Date.now();if(!Number.isFinite(duration)||duration<=0||duration>MAX_TIMER_DELAY_MS)throw new StoreError('budget_deadline_unsupported','资源截止时间未具备可验证的原生时限。',409);
   const id=`model-${randomUUID()}`;
   budget.reserve({id,kind:'model',units:{modelRequests:1,outputTokens:request.maxTokens!,computeMilliseconds:0},binding:b});reservation=id;
   budget.dispatch(reservation);dispatched=true;this.#active.set(id,{fact,credential,deadlineAt:Date.parse(snapshot.config!.expiresAt),rearm:arm,stop});arm(Date.parse(snapshot.config!.expiresAt));
   for await(const chunk of next()) {
    // Accounting belongs to the original request even after business/egress qualification is withdrawn.
    if(chunk.type==='usage'){if(!validUsage(chunk.usage)){usageInvalid=true;stop('budget_usage_invalid');}else usage={...chunk.usage};}
    if(chunk.type==='finish'){
     finished=true;
     if(usage&&!usageInvalid){budget.settle(reservation,{receiptId:`native-${reservation}`,actual:{modelRequests:1,outputTokens:usage.outputTokens,computeMilliseconds:0},usage});this.#enforceActive(b.delegationId);}
     else budget.markUnknown(reservation,'native_usage_unconfirmed');
    }
    if(!blocked)try{this.#check(b);this.egress.recheck(b,receipt);if(credential)this.credentials.assertAuthorized(credential);const state=budget.snapshot();if(state.expired||state.overrun||state.accountingOverflow)stop('budget_exhausted');}catch(error){stop(safeCode(error));}
    if(!blocked)yield safeFailure(chunk);
   }
   if(blocked)throw blocked;
  }catch(error){
   const code=safeCode(error);if(reservation){const budget=this.budget(b.delegationId);if(dispatched)budget.markUnknown(reservation,'native_effect_unconfirmed');else budget.releaseUndispatched(reservation);}
   stop(code);throw new StoreError(code,'Host 资源或资料出口未具备当前资格；本次请求已收束或保留未确认。',409);
  }finally{
   if(reservation&&dispatched){const budget=this.budget(b.delegationId);if(!finished)budget.markUnknown(reservation,'native_effect_unconfirmed');}
   if(reservation)this.#active.delete(reservation);if(timer){if(onDeadline)timer.signal.removeEventListener('abort',onDeadline);timer[Symbol.dispose]();}
   this.#o.changed?.(b.delegationId);
  }
 }
 close():void {this.#closed=true;this.credentials.close();}
}
