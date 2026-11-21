import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {StoreError} from './domain.ts';
import type {Owner} from './domain.ts';
import type {SentiStore} from './store.ts';

export type LocalRole='operator'|'maintainer';
export interface LocalAuthConfig {operatorTokenHash:string;maintainerTokenHash:string;sessionTtlSeconds?:number;}
export interface LocalSession {role:LocalRole;owner:Owner;expiresAt:string;}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const same=(a:string,b:string)=>timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
export class LocalAuth {
 readonly #store:SentiStore;readonly #owner:Owner;readonly #config:Required<LocalAuthConfig>;readonly #attempts=new Map<string,{count:number;resetAt:number}>();
 constructor(store:SentiStore,owner:Owner,config:LocalAuthConfig){
  if(!config||!/^[0-9a-f]{64}$/.test(config.operatorTokenHash)||!/^[0-9a-f]{64}$/.test(config.maintainerTokenHash)||config.operatorTokenHash===config.maintainerTokenHash)throw new StoreError('auth_configuration_invalid','本机角色令牌哈希无效或重复。',503);
  const ttl=config.sessionTtlSeconds??28800;if(!Number.isSafeInteger(ttl)||ttl<60||ttl>86400)throw new StoreError('auth_configuration_invalid','本机会话时限无效。',503);
  this.#store=store;this.#owner=Object.freeze({...owner});this.#config={...config,sessionTtlSeconds:ttl};
  store.connection.exec('CREATE TABLE IF NOT EXISTS auth_sessions(session_hash TEXT PRIMARY KEY,role TEXT NOT NULL,enterprise_id TEXT NOT NULL,principal_id TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT)');
 }
 login(token:string,remoteAddress:string):{token:string;session:LocalSession}{
  const now=Date.now(),attempt=this.#attempts.get(remoteAddress);if(attempt&&attempt.resetAt>now&&attempt.count>=5)throw new StoreError('login_rate_limited','登录尝试过多，请稍后再试。',429);
  if(typeof token!=='string'||!token||token.length>512)throw new StoreError('authentication_failed','令牌无效或会话已失效。',401);
  const digest=hash(token),role=same(digest,this.#config.operatorTokenHash)?'operator':same(digest,this.#config.maintainerTokenHash)?'maintainer':undefined;
  if(!role){const next=attempt&&attempt.resetAt>now?{count:attempt.count+1,resetAt:attempt.resetAt}:{count:1,resetAt:now+900000};this.#attempts.set(remoteAddress,next);throw new StoreError('authentication_failed','令牌无效或会话已失效。',401);}
  this.#attempts.delete(remoteAddress);const sessionToken=randomBytes(32).toString('hex'),expiresAt=new Date(now+this.#config.sessionTtlSeconds*1000).toISOString(),session:LocalSession={role,owner:{...this.#owner},expiresAt};
  this.#store.connection.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?,?,?,NULL)').run(hash(sessionToken),role,this.#owner.enterpriseId,this.#owner.principalId,new Date(now).toISOString(),expiresAt);
  return{token:sessionToken,session};
 }
 resolve(token:string|undefined):LocalSession|undefined{
  if(!token)return undefined;const row=this.#store.connection.prepare('SELECT role,enterprise_id,principal_id,expires_at,revoked_at FROM auth_sessions WHERE session_hash=?').get(hash(token)) as{role:LocalRole;enterprise_id:string;principal_id:string;expires_at:string;revoked_at:string|null}|undefined;
  if(!row||row.revoked_at||Date.parse(row.expires_at)<=Date.now()||row.enterprise_id!==this.#owner.enterpriseId||row.principal_id!==this.#owner.principalId)return undefined;
  return{role:row.role,owner:{enterpriseId:row.enterprise_id,principalId:row.principal_id},expiresAt:row.expires_at};
 }
 logout(token:string|undefined):void{if(token)this.#store.connection.prepare('UPDATE auth_sessions SET revoked_at=? WHERE session_hash=? AND revoked_at IS NULL').run(new Date().toISOString(),hash(token));}
 get sessionTtlSeconds():number{return this.#config.sessionTtlSeconds;}
}
