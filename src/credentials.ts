import type { CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { StoreError } from './domain.ts';
import type { Owner } from './domain.ts';
import type { SentiStore } from './store.ts';

export type CredentialPurpose = 'model' | 'connector';
export interface CredentialUseBinding {
  readonly owner: Owner; readonly delegationId: string; readonly provider: string;
  readonly purpose: CredentialPurpose; readonly ref: string; readonly revision: number;
}
export interface CredentialGrant extends CredentialUseBinding { readonly enabled: boolean; readonly recordKey: string; }
export interface CredentialRecordsPort {
  readRecord(key: string): Promise<CredentialRecord | undefined>;
  modifyRecord(key: string, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>): Promise<CredentialRecord | undefined>;
}
export type CredentialStatus = 'ready' | 'missing' | 'revoked' | 'stale' | 'unqualified' | 'invalid' | 'unavailable';
export interface CredentialDescription { readonly ref: string; readonly revision: number; readonly status: CredentialStatus; }
export interface CredentialReceipt { readonly ref: string; readonly revision: number; readonly used: true; }
export interface CredentialRotationReceipt { readonly ref: string; readonly revision: number; readonly rotated: true; }

type FailureCode='credential_transaction'|'credential_scope'|'credential_revoked'|'credential_stale'|'credential_unqualified'|'credential_invalid'|'credential_missing'|'credential_unavailable'|'credential_cancelled'|'credential_use_failed';
const messages:Record<FailureCode,string>={credential_transaction:'凭据授权配置不能嵌入业务事务。',credential_scope:'凭据能力不在当前委托范围。',credential_revoked:'凭据能力已撤回。',credential_stale:'凭据授权修订已变化。',credential_unqualified:'当前研究资格不允许使用凭据。',credential_invalid:'凭据记录不符合此能力要求。',credential_missing:'凭据尚未配置。',credential_unavailable:'凭据服务暂不可确认。',credential_cancelled:'凭据操作已取消。',credential_use_failed:'凭据操作未返回可确认结果。'};
class CredentialFailure extends StoreError {
  constructor(code:FailureCode){super(code,messages[code],code==='credential_scope'?404:code==='credential_unavailable'?503:409);}
}
function validText(value:unknown,max=256):value is string {return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);}
function sameOwner(a:Owner,b:Owner){return a.enterpriseId===b.enterpriseId&&a.principalId===b.principalId;}

/** Host-only credential authorization; the official record service remains the secret authority. */
export class HostCredentials {
  readonly #store:SentiStore;
  readonly #records:CredentialRecordsPort;
  readonly #owner:Owner;
  readonly #isCurrent:(binding:CredentialUseBinding)=>boolean;
  readonly #active=new Map<string,Set<{binding:CredentialUseBinding;controller:AbortController}>>();
  #closed=false;
  constructor(store:SentiStore,records:CredentialRecordsPort,options:{owner:Owner;isCurrent(binding:CredentialUseBinding):boolean}) {
    this.#store=store;this.#records=records;this.#owner=Object.freeze({...options.owner});this.#isCurrent=options.isCurrent;
    store.connection.exec(`CREATE TABLE IF NOT EXISTS credential_grants (
      enterprise_id TEXT NOT NULL,principal_id TEXT NOT NULL,delegation_id TEXT NOT NULL REFERENCES delegations(id),
      ref TEXT NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)),PRIMARY KEY(enterprise_id,principal_id,delegation_id,ref));
      CREATE TABLE IF NOT EXISTS credential_grant_events (seq INTEGER PRIMARY KEY AUTOINCREMENT,enterprise_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,delegation_id TEXT NOT NULL,ref TEXT NOT NULL,revision INTEGER NOT NULL,enabled INTEGER NOT NULL,at TEXT NOT NULL)`);
  }
  #binding(input:CredentialUseBinding):CredentialUseBinding {
    if(!input||!input.owner||!sameOwner(input.owner,this.#owner)||!validText(input.delegationId)||!validText(input.provider)||!validText(input.ref,128)
      ||!['model','connector'].includes(input.purpose)||!Number.isSafeInteger(input.revision)||input.revision<1)throw new CredentialFailure('credential_scope');
    return Object.freeze({owner:this.#owner,delegationId:input.delegationId,provider:input.provider,purpose:input.purpose,ref:input.ref,revision:input.revision});
  }
  #identity(input:CredentialUseBinding) {return JSON.stringify([input.owner.enterpriseId,input.owner.principalId,input.delegationId,input.ref]);}
  #row(binding:CredentialUseBinding):CredentialGrant|undefined {
    const row=this.#store.connection.prepare('SELECT value FROM credential_grants WHERE enterprise_id=? AND principal_id=? AND delegation_id=? AND ref=?')
      .get(this.#owner.enterpriseId,this.#owner.principalId,binding.delegationId,binding.ref);
    return row?JSON.parse(row.value as string) as CredentialGrant:undefined;
  }
  #check(binding:CredentialUseBinding,qualified=true):CredentialGrant {
    if(this.#closed)throw new CredentialFailure('credential_unqualified');
    const scope=this.#store.connection.prepare('SELECT lifecycle FROM delegations WHERE id=? AND enterprise_id=? AND principal_id=?').get(binding.delegationId,this.#owner.enterpriseId,this.#owner.principalId);
    if(!scope)throw new CredentialFailure('credential_scope');
    const lifecycle=scope.lifecycle;
    const grant=this.#row(binding);
    if(!grant||grant.provider!==binding.provider||grant.purpose!==binding.purpose)throw new CredentialFailure('credential_scope');
    if(!grant.enabled)throw new CredentialFailure('credential_revoked');
    if(grant.revision!==binding.revision)throw new CredentialFailure('credential_stale');
    if(qualified){let current=false;try{current=this.#isCurrent(binding)===true;}catch{/* only a fixed qualification failure may cross this seam */}
      if(lifecycle!=='active'||!current)throw new CredentialFailure('credential_unqualified');}
    return grant;
  }
  #write(grant:CredentialGrant) {
    this.#store.connection.prepare('INSERT INTO credential_grants VALUES (?,?,?,?,?) ON CONFLICT(enterprise_id,principal_id,delegation_id,ref) DO UPDATE SET value=excluded.value')
      .run(this.#owner.enterpriseId,this.#owner.principalId,grant.delegationId,grant.ref,JSON.stringify(grant));
    this.#store.connection.prepare('INSERT INTO credential_grant_events(enterprise_id,principal_id,delegation_id,ref,revision,enabled,at) VALUES (?,?,?,?,?,?,?)')
      .run(this.#owner.enterpriseId,this.#owner.principalId,grant.delegationId,grant.ref,grant.revision,grant.enabled?1:0,new Date().toISOString());
  }
  /** Replaces this Host owner's complete non-secret grant set. Missing enabled grants are revoked. */
  configure(inputs:readonly CredentialGrant[]):void {
    if(this.#store.connection.isTransaction)throw new CredentialFailure('credential_transaction');
    if(!Array.isArray(inputs))throw new CredentialFailure('credential_invalid');
    const grants=inputs.map(input=>{const binding=this.#binding(input);
      if(Object.keys(input).some(k=>!['owner','delegationId','provider','purpose','ref','revision','enabled','recordKey'].includes(k))||typeof input.enabled!=='boolean'||!validText(input.recordKey)||!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(input.recordKey))throw new CredentialFailure('credential_invalid');
      try{this.#store.get(this.#owner,binding.delegationId);}catch{throw new CredentialFailure('credential_scope');}
      return {...binding,enabled:input.enabled,recordKey:input.recordKey};});
    if(new Set(grants.map(g=>this.#identity(g))).size!==grants.length)throw new CredentialFailure('credential_invalid');
    this.#store.withTransaction(()=>{
      const prior=this.#store.connection.prepare('SELECT value FROM credential_grants WHERE enterprise_id=? AND principal_id=?').all(this.#owner.enterpriseId,this.#owner.principalId).map(r=>JSON.parse(r.value as string) as CredentialGrant);
      for(const grant of grants){const old=prior.find(g=>this.#identity(g)===this.#identity(grant));
        if(old&&JSON.stringify(old)===JSON.stringify(grant))continue;
        if(old&&grant.revision<=old.revision)throw new CredentialFailure('credential_stale');
        this.#write(grant);}
      for(const old of prior)if(old.enabled&&!grants.some(g=>this.#identity(g)===this.#identity(old)))this.#write({...old,enabled:false,revision:old.revision+1});
    });
    for(const active of this.#active.values())for(const use of active){try{this.#check(use.binding);}catch{use.controller.abort(new CredentialFailure('credential_cancelled'));}}
  }
  /** Host administration only: complete current-owner metadata, never an Agent/HTTP projection. */
  listGrants():readonly CredentialGrant[] {
    return this.#store.connection.prepare('SELECT value FROM credential_grants WHERE enterprise_id=? AND principal_id=? ORDER BY delegation_id,ref')
      .all(this.#owner.enterpriseId,this.#owner.principalId).map(row=>JSON.parse(row.value as string) as CredentialGrant);
  }
  /** Host-only current grant/qualification check; performs no credential-store I/O. */
  assertAuthorized(input:CredentialUseBinding):void {this.#check(this.#binding(input));}
  #secret(record:CredentialRecord|undefined):string {
    if(record===undefined)throw new CredentialFailure('credential_missing');
    if(record.kind!=='api-key'||typeof record.key!=='string'||record.key.trim().length===0||record.env!==undefined)throw new CredentialFailure('credential_invalid');
    return record.key;
  }
  async describe(input:CredentialUseBinding):Promise<CredentialDescription> {
    const binding=this.#binding(input);
    try{const grant=this.#check(binding);this.#secret(await this.#records.readRecord(grant.recordKey));this.#check(binding);return {ref:binding.ref,revision:binding.revision,status:'ready'};}
    catch(error){const statuses:Partial<Record<FailureCode,CredentialStatus>>={credential_scope:'unavailable',credential_revoked:'revoked',credential_stale:'stale',credential_unqualified:'unqualified',credential_invalid:'invalid',credential_missing:'missing'};
      return {ref:binding.ref,revision:binding.revision,status:error instanceof CredentialFailure?(statuses[error.code as FailureCode]??'unavailable'):'unavailable'};}
  }
  /** Trusted Host transport callback only. Never register this capability as an Agent or browser tool. */
  async use(input:CredentialUseBinding,signal:AbortSignal,consume:(secret:string,signal:AbortSignal)=>Promise<void>):Promise<CredentialReceipt> {
    const binding=this.#binding(input),controller=new AbortController();
    if(signal.aborted)throw new CredentialFailure('credential_cancelled');
    const onAbort=()=>controller.abort(new CredentialFailure('credential_cancelled'));
    signal.addEventListener('abort',onAbort,{once:true});
    const identity=this.#identity(binding),active={binding,controller},set=this.#active.get(identity)??new Set();
    set.add(active);this.#active.set(identity,set);let stage:'read'|'consume'='read';
    try{
      const grant=this.#check(binding);
      const record=await this.#records.readRecord(grant.recordKey);
      if(controller.signal.aborted)throw new CredentialFailure('credential_cancelled');
      this.#check(binding);const secret=this.#secret(record);stage='consume';
      await consume(secret,controller.signal); // Intentionally discard any runtime return value.
      if(controller.signal.aborted)throw new CredentialFailure('credential_cancelled');
      this.#check(binding);return {ref:binding.ref,revision:binding.revision,used:true};
    }catch(error){
      if(controller.signal.aborted||signal.aborted)throw new CredentialFailure('credential_cancelled');
      if(error instanceof CredentialFailure)throw new CredentialFailure(error.code as FailureCode);
      throw new CredentialFailure(stage==='consume'?'credential_use_failed':'credential_unavailable');
    }finally{signal.removeEventListener('abort',onAbort);set.delete(active);if(!set.size)this.#active.delete(identity);}
  }
  /** Closes only this capability's future admission and aborts its active Host operations. */
  close():void {this.#closed=true;for(const active of this.#active.values())for(const use of active)use.controller.abort(new CredentialFailure('credential_cancelled'));}

  /** Host administration only; the official store owns serialization, persistence and rotation notification. */
  async rotate(input:CredentialUseBinding,secret:string):Promise<CredentialRotationReceipt> {
    const binding=this.#binding(input);
    if(typeof secret!=='string'||secret.trim().length===0)throw new CredentialFailure('credential_invalid');
    try{const grant=this.#check(binding,false);
      await this.#records.modifyRecord(grant.recordKey,async()=>{this.#check(binding,false);return {kind:'api-key',key:secret};});
      this.#check(binding,false);return {ref:binding.ref,revision:binding.revision,rotated:true};
    }catch(error){if(error instanceof CredentialFailure)throw new CredentialFailure(error.code as FailureCode);throw new CredentialFailure('credential_unavailable');}
  }

}
