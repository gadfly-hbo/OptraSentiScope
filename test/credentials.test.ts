import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {CredentialRecord} from '@deepseek-ai/dsh-credentials';
import {SentiStore} from '../src/store.ts';
import {HostCredentials} from '../src/credentials.ts';
import type {CredentialGrant,CredentialUseBinding,CredentialRecordsPort} from '../src/credentials.ts';

const owner={enterpriseId:'credential-engineering',principalId:'operator'};
function fixture() {
 const store=new SentiStore({filename:':memory:'});
 const delegation=store.create(owner,{goal:'Synthetic credential boundary fixture',idempotencyKey:'create'});
 const values=new Map<string,CredentialRecord>();let reads=0;let writes=0;let current=true;
 const records:CredentialRecordsPort={async readRecord(key){reads++;return values.get(key);},async modifyRecord(key,mutate){writes++;const next=await mutate(values.get(key));if(next!==undefined)values.set(key,next);return values.get(key);}};
 const host=new HostCredentials(store,records,{owner,isCurrent:()=>current});
 const grant:CredentialGrant={owner,delegationId:delegation.id,provider:'synthetic-engineering',purpose:'model',ref:'opaque-reference',revision:1,enabled:true,recordKey:'sentiscope/synthetic-credential'};
 return {store,delegation,values,host,grant,records,reads:()=>reads,writes:()=>writes,setCurrent:(v:boolean)=>{current=v;}};
}
test('an authorized missing stored record stays missing and never falls through to an ambient credential',async()=>{
 const f=fixture();try{f.host.configure([f.grant]);assert.deepEqual(await f.host.describe(f.grant),{ref:f.grant.ref,revision:1,status:'missing'});assert.equal(f.reads(),1);}finally{f.store.close();}
});
test('a Host operation receives one current secret while its arbitrary return value cannot cross the boundary',async()=>{
 const f=fixture();try{f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-key-one'});f.host.configure([f.grant]);let seen:string|undefined;
 const receipt=await f.host.use(f.grant,new AbortController().signal,async(secret,signal)=>{assert.equal(signal.aborted,false);seen=secret;return secret as unknown as void;});
 assert.equal(seen,'synthetic-key-one');assert.deepEqual(receipt,{ref:f.grant.ref,revision:1,used:true});assert.equal(JSON.stringify(receipt).includes('synthetic-key-one'),false);
 }finally{f.store.close();}
});
test('rotation uses the official serialized record port and the next operation reads the new value',async()=>{
 const f=fixture();try{f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-old-key'});f.host.configure([f.grant]);const seen:string[]=[];
 await f.host.use(f.grant,new AbortController().signal,async(secret)=>{seen.push(secret);});
 const rotated=await f.host.rotate(f.grant,'synthetic-new-key');
 await f.host.use(f.grant,new AbortController().signal,async(secret)=>{seen.push(secret);});
 assert.deepEqual(seen,['synthetic-old-key','synthetic-new-key']);assert.equal(f.writes(),1);assert.deepEqual(rotated,{ref:f.grant.ref,revision:1,rotated:true});
 }finally{f.store.close();}
});
test('an asynchronous qualification cannot silently authorize a credential',async()=>{
 const f=fixture();try{f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-key'});
 const gate=new HostCredentials(f.store,f.records,{owner,isCurrent:(()=>Promise.resolve(true)) as unknown as (binding:CredentialUseBinding)=>boolean});gate.configure([f.grant]);
 assert.equal((await gate.describe(f.grant)).status,'unqualified');
 }finally{f.store.close();}
});
test('wrong owner, delegation, provider, purpose and revision cannot resolve a stored secret',async()=>{
 const f=fixture();try{f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-key'});f.host.configure([f.grant]);let consumed=0;
 const attempts=[{...f.grant,owner:{...owner,principalId:'another-operator'}},{...f.grant,delegationId:'unowned-delegation'},{...f.grant,provider:'another-provider'},{...f.grant,purpose:'connector' as const},{...f.grant,revision:2}];
 for(const binding of attempts)await assert.rejects(f.host.use(binding,new AbortController().signal,async()=>{consumed++;}));
 assert.equal(f.reads(),0);assert.equal(consumed,0);
 }finally{f.store.close();}
});
test('record and consumer failures expose fixed codes without the original message, cause or record address',async()=>{
 const f=fixture();try{f.host.configure([f.grant]);const marker='synthetic-secret-error-marker';
 f.records.readRecord=async()=>{throw new Error(`${marker} ${f.grant.recordKey}`);};
 await assert.rejects(f.host.use(f.grant,new AbortController().signal,async()=>{}),(error:unknown)=>{assert.ok(error instanceof Error);assert.equal((error as {code?:string}).code,'credential_unavailable');assert.equal(String(error).includes(marker),false);assert.equal(String(error).includes(f.grant.recordKey),false);assert.equal(error.cause,undefined);return true;});
 assert.deepEqual(await f.host.describe(f.grant),{ref:f.grant.ref,revision:1,status:'unavailable'});
 f.records.readRecord=async()=>({kind:'api-key',key:'synthetic-key'});
 await assert.rejects(f.host.use(f.grant,new AbortController().signal,async()=>{throw new Error(marker);}),(error:unknown)=>{assert.ok(error instanceof Error);assert.equal((error as {code?:string}).code,'credential_use_failed');assert.equal(String(error).includes(marker),false);assert.equal(error.cause,undefined);return true;});
 }finally{f.store.close();}
});
test('revocation during an asynchronous record read prevents the Host callback and does not delete a shared record',async()=>{
 const f=fixture();try{f.host.configure([f.grant]);let release!:(record:CredentialRecord)=>void;let consumed=false;
 f.records.readRecord=async()=>new Promise(resolve=>{release=resolve;});
 const pending=f.host.use(f.grant,new AbortController().signal,async()=>{consumed=true;});
 f.host.configure([]);release({kind:'api-key',key:'synthetic-key'});
 await assert.rejects(pending,{code:'credential_cancelled'});assert.equal(consumed,false);assert.equal((await f.host.describe(f.grant)).status,'revoked');assert.equal(f.writes(),0);
 }finally{f.store.close();}
});
test('changing an authorization revision aborts the matching in-flight consume and the old binding stays stale',async()=>{
 const f=fixture();try{f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-key'});f.host.configure([f.grant]);let entered!:()=>void;const begun=new Promise<void>(resolve=>{entered=resolve;});let scoped:AbortSignal|undefined;
 const pending=f.host.use(f.grant,new AbortController().signal,async(_secret,signal)=>{scoped=signal;entered();await new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
 await begun;f.host.configure([{...f.grant,revision:2}]);assert.equal(scoped?.aborted,true);await assert.rejects(pending,{code:'credential_cancelled'});
 assert.equal((await f.host.describe(f.grant)).status,'stale');assert.equal((await f.host.describe({...f.grant,revision:2})).status,'ready');
 }finally{f.store.close();}
});
test('caller cancellation and capability close abort only scoped work and deny later admission',async()=>{
 const f=fixture();try{f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-key'});f.host.configure([f.grant]);const before=new AbortController();before.abort(new Error('synthetic-sensitive-caller-reason'));
 await assert.rejects(f.host.use(f.grant,before.signal,async()=>{throw new Error('MUST NOT CONSUME');}),{code:'credential_cancelled'});assert.equal(f.reads(),0);
 let entered!:()=>void;const begun=new Promise<void>(resolve=>{entered=resolve;});const pending=f.host.use(f.grant,new AbortController().signal,async(_secret,signal)=>{entered();await new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
 await begun;f.host.close();await assert.rejects(pending,{code:'credential_cancelled'});await assert.rejects(f.host.use(f.grant,new AbortController().signal,async()=>{}),{code:'credential_unqualified'});
 }finally{f.store.close();}
});
test('current qualification is rechecked after record lookup and unsupported or empty record forms never reach consumption',async()=>{
 const f=fixture();try{f.host.configure([f.grant]);let release!:(record:CredentialRecord)=>void;let consumed=0;
 f.records.readRecord=async()=>new Promise(resolve=>{release=resolve;});const pending=f.host.use(f.grant,new AbortController().signal,async()=>{consumed++;});
 f.setCurrent(false);release({kind:'api-key',key:'synthetic-key'});await assert.rejects(pending,{code:'credential_unqualified'});assert.equal(consumed,0);f.setCurrent(true);
 for(const record of [{kind:'api-key'} as const,{kind:'api-key',key:'  '} as const,{kind:'api-key',key:'synthetic-key',env:{SYNTHETIC:'not-exported'}} as const,{kind:'grant',payload:{token:'synthetic-token'}} as const]){
 f.records.readRecord=async()=>record;assert.equal((await f.host.describe(f.grant)).status,'invalid');await assert.rejects(f.host.use(f.grant,new AbortController().signal,async()=>{consumed++;}),{code:'credential_invalid'});}
 assert.equal(consumed,0);
 }finally{f.store.close();}
});
test('one delegation revocation does not cancel another delegation authorized for the same stored record',async()=>{
 const f=fixture();try{const other=f.store.create(owner,{goal:'Another synthetic delegation',idempotencyKey:'other'});const otherGrant={...f.grant,delegationId:other.id};f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-shared-key'});f.host.configure([f.grant,otherGrant]);
 let entered!:()=>void;const begun=new Promise<void>(resolve=>{entered=resolve;});let complete!:()=>void;let scoped:AbortSignal|undefined;
 const pending=f.host.use(otherGrant,new AbortController().signal,async(_secret,signal)=>{scoped=signal;entered();await new Promise<void>(resolve=>{complete=resolve;});});await begun;
 f.host.configure([otherGrant]);assert.equal(scoped?.aborted,false);complete();assert.deepEqual(await pending,{ref:otherGrant.ref,revision:1,used:true});assert.equal((await f.host.describe(f.grant)).status,'revoked');
 }finally{f.store.close();}
});
test('a rejected same-revision grant change leaves the prior authorization unchanged',async()=>{
 const f=fixture();try{f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-key'});f.host.configure([f.grant]);assert.throws(()=>f.host.configure([{...f.grant,provider:'different-route'}]),{code:'credential_stale'});assert.equal((await f.host.describe(f.grant)).status,'ready');
 }finally{f.store.close();}
});
test('synchronous authorization checks do not resolve records or claim the credential is configured',async()=>{
 const f=fixture();try{f.host.configure([f.grant]);f.host.assertAuthorized(f.grant);assert.equal(f.reads(),0);assert.equal((await f.host.describe(f.grant)).status,'missing');
 f.host.configure([]);assert.throws(()=>f.host.assertAuthorized(f.grant),{code:'credential_revoked'});assert.equal(f.reads(),1);
 }finally{f.store.close();}
});

test('non-secret grants and revocation survive a fresh business store and Host capability instance',async()=>{
 const root=resolve('.local/archives/host-controls-v01-20261117/credentials');mkdirSync(root,{recursive:true});const directory=mkdtempSync(join(root,'reopen-')),file=join(directory,'business.sqlite');
 const records:CredentialRecordsPort={async readRecord(){return {kind:'api-key',key:'synthetic-persistent-sdk-record'};},async modifyRecord(_key,mutate){return mutate(undefined);}};
 let store=new SentiStore({filename:file});try{const d=store.create(owner,{goal:'Synthetic persistent credential authorization',idempotencyKey:'create'});const grant:CredentialGrant={owner,delegationId:d.id,provider:'synthetic-engineering',purpose:'model',ref:'persistent-ref',revision:1,enabled:true,recordKey:'sentiscope/persistent-key'};
 let host=new HostCredentials(store,records,{owner,isCurrent:()=>true});host.configure([grant]);host.close();store.close();
 store=new SentiStore({filename:file});host=new HostCredentials(store,records,{owner,isCurrent:()=>true});assert.equal((await host.describe(grant)).status,'ready');host.configure([]);host.close();store.close();
 store=new SentiStore({filename:file});host=new HostCredentials(store,records,{owner,isCurrent:()=>true});assert.equal((await host.describe(grant)).status,'revoked');host.close();
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test('credential grant configuration refuses an outer transaction so a rollback cannot follow an irreversible cancellation',async()=>{
 const f=fixture();try{f.values.set(f.grant.recordKey,{kind:'api-key',key:'synthetic-key'});f.host.configure([f.grant]);
 assert.throws(()=>f.store.withTransaction(()=>f.host.configure([])),{code:'credential_transaction'});
 assert.equal((await f.host.describe(f.grant)).status,'ready');
 }finally{f.store.close();}
});
test('a record address must follow the public scope/id grammar rather than accept a bare secret as metadata',()=>{
 const f=fixture();try{assert.throws(()=>f.host.configure([{...f.grant,recordKey:'synthetic-bare-value-with-no-scope'}]),{code:'credential_invalid'});assert.equal(f.reads(),0);assert.equal(f.writes(),0);}finally{f.store.close();}
});
test('Host grant listing is owner scoped, includes revoked metadata and returns detached values without resolving secrets',()=>{
 const f=fixture();try{const revoked={...f.grant,ref:'kept-revoked',enabled:false};f.host.configure([f.grant,revoked]);const otherOwner={...owner,principalId:'separate-owner'};
 const otherDelegation=f.store.create(otherOwner,{goal:'Separate synthetic Host owner',idempotencyKey:'other-owner-create'});const other=new HostCredentials(f.store,f.records,{owner:otherOwner,isCurrent:()=>true});other.configure([{...f.grant,owner:otherOwner,delegationId:otherDelegation.id}]);
 const listed=f.host.listGrants();assert.equal(listed.length,2);assert.deepEqual(listed.map(g=>g.ref).sort(),['kept-revoked','opaque-reference']);assert.ok(listed.every(g=>g.owner.principalId===owner.principalId));assert.equal(listed.find(g=>g.ref==='kept-revoked')?.enabled,false);assert.equal(listed.find(g=>g.ref===f.grant.ref)?.recordKey,f.grant.recordKey);
 const expected=structuredClone(listed);(listed[0].owner as {principalId:string}).principalId='mutated-owner';(listed[0] as {recordKey:string}).recordKey='mutated/address';(listed as CredentialGrant[]).push({...f.grant,ref:'not-persisted'});
 assert.deepEqual(f.host.listGrants(),expected);assert.equal(other.listGrants().length,1);assert.equal(f.reads(),0);assert.equal(f.writes(),0);other.close();
 }finally{f.store.close();}
});
