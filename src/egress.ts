import{StoreError}from'./domain.ts';
import type{Owner}from'./domain.ts';
import type{SentiStore}from'./store.ts';
import type{RunBinding}from'../runtime/index.ts';
export interface ModelEgressGrant {revision:number;enabled:boolean;provider:string;model:string;maxTokens:number;credential?:{ref:string;revision:number};}
export interface EgressReceipt {channel:'model';revision:number;provider:string;model:string;maxTokens:number;credential?:{ref:string;revision:number};}
export type EgressChannel='model'|'external-research'|'notification'|'export'|'telemetry'|'backup';
/** An authorization ledger, not a claim of OS/network isolation. No sender, fetcher or exporter is installed here. */
export class HostEgress {
 readonly #store:SentiStore;readonly #owner:Owner;readonly #current:(b:RunBinding)=>boolean;
 constructor(store:SentiStore,options:{owner:Owner;isCurrent:(b:RunBinding)=>boolean}){this.#store=store;this.#owner=Object.freeze({...options.owner});this.#current=options.isCurrent;
  store.connection.exec('CREATE TABLE IF NOT EXISTS host_model_egress (enterprise_id TEXT NOT NULL,principal_id TEXT NOT NULL,delegation_id TEXT NOT NULL REFERENCES delegations(id),value TEXT NOT NULL,PRIMARY KEY(enterprise_id,principal_id,delegation_id))');}
 #scope(id:string){return this.#store.scope(this.#owner,id);}
 #read(id:string):ModelEgressGrant|undefined {this.#scope(id);const row=this.#store.connection.prepare('SELECT value FROM host_model_egress WHERE enterprise_id=? AND principal_id=? AND delegation_id=?').get(this.#owner.enterpriseId,this.#owner.principalId,id);return row?JSON.parse(row.value as string):undefined;}
 configure(id:string,grant:ModelEgressGrant):void {
  this.#scope(id);
  if(!grant||Object.keys(grant).some(k=>!['revision','enabled','provider','model','maxTokens','credential'].includes(k))||!Number.isSafeInteger(grant.revision)||grant.revision<1||typeof grant.enabled!=='boolean'||typeof grant.provider!=='string'||!grant.provider.trim()||grant.provider.length>128||typeof grant.model!=='string'||!grant.model.trim()||grant.model.length>128||!Number.isSafeInteger(grant.maxTokens)||grant.maxTokens<1||grant.maxTokens>1048576)throw new StoreError('invalid_egress_grant','模型出口授权无效。');
  if(grant.credential&&(!grant.credential.ref||typeof grant.credential.ref!=='string'||grant.credential.ref.length>128||!Number.isSafeInteger(grant.credential.revision)||grant.credential.revision<1||Object.keys(grant.credential).some(k=>!['ref','revision'].includes(k))))throw new StoreError('invalid_egress_grant','凭据引用无效。');
  const detached:ModelEgressGrant={revision:grant.revision,enabled:grant.enabled,provider:grant.provider,model:grant.model,maxTokens:grant.maxTokens,...(grant.credential?{credential:{ref:grant.credential.ref,revision:grant.credential.revision}}:{})};
  this.#store.withTransaction(()=>{const prior=this.#read(id);if(prior&&JSON.stringify(prior)!==JSON.stringify(detached)&&detached.revision<=prior.revision)throw new StoreError('stale_egress_grant','出口授权变化必须递增修订。',409);this.#store.connection.prepare('INSERT INTO host_model_egress VALUES (?,?,?,?) ON CONFLICT(enterprise_id,principal_id,delegation_id) DO UPDATE SET value=excluded.value').run(this.#owner.enterpriseId,this.#owner.principalId,id,JSON.stringify(detached));});
 }
 #qualify(binding:RunBinding){const d=this.#scope(binding.delegationId);if(binding.owner.enterpriseId!==this.#owner.enterpriseId||binding.owner.principalId!==this.#owner.principalId||binding.goalRevision!==d.goalRevision||d.lifecycle!=='active'||!this.#current(binding))throw new StoreError('stale_egress_binding','资料出口资格已失效。',409);}
 authorize(binding:RunBinding,request:{channel:string;provider?:string;model?:string;maxTokens?:number}):EgressReceipt {
  this.#qualify(binding);const grant=this.#read(binding.delegationId);
  if(request.channel!=='model'||!grant?.enabled||grant.provider!==request.provider||grant.model!==request.model||!Number.isSafeInteger(request.maxTokens)||request.maxTokens!<1||request.maxTokens!>grant.maxTokens)throw new StoreError('egress_denied','当前出口未获授权；未发送资料。',403);
  return {channel:'model',revision:grant.revision,provider:grant.provider,model:grant.model,maxTokens:grant.maxTokens,...(grant.credential?{credential:{...grant.credential}}:{})};
 }
 recheck(binding:RunBinding,receipt:EgressReceipt):void {const current=this.authorize(binding,{channel:'model',provider:receipt.provider,model:receipt.model,maxTokens:receipt.maxTokens});if(current.revision!==receipt.revision)throw new StoreError('egress_changed','出口授权已变化；旧请求不能继续。',409);}
 snapshot(id:string){const grant=this.#read(id);return {model:{status:grant?(grant.enabled?'configured':'revoked'):'unconfigured',revision:grant?.revision??null},externalResearch:'disabled',notifications:'disabled',exports:'disabled',telemetry:'disabled',backups:'disabled'};}
}
