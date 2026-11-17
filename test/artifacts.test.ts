import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import type {ArtifactContent,ArtifactEvidence} from '../src/artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

const owner={enterpriseId:'artifact-engineering',principalId:'operator'};
const evidence:ArtifactEvidence[]=[{ref:'synthetic-source/revision-1',hash:'1'.repeat(64)}];
function judgment(summary='Evidence supports a limited judgment'):ArtifactContent{return {kind:'judgment',title:'Synthetic judgment',summary,evidence,assumptions:['Only the authorized synthetic scope'],unknowns:['No business effectiveness claim'],applicability:'Synthetic engineering facts only',invalidatedBy:['A conflicting authorized source revision']};}
function fixture(filename=':memory:'){
 const store=new SentiStore({filename});const d=store.create(owner,{goal:'Synthetic versioned research delivery',idempotencyKey:'create'});
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,role:'main',epoch:1,generation:1};
 let current=true;let verify:ArtifactOptionsVerify=async()=>{};
 const artifacts=new ArtifactStore(store,{owner,delegationId:d.id},{isCurrent:()=>current,verifyEvidence:async(b,refs)=>verify(b,refs),now:()=> '2026-11-17T04:00:00.000Z'});
 return {store,d,binding,artifacts,setCurrent:(value:boolean)=>{current=value;},setVerify:(value:ArtifactOptionsVerify)=>{verify=value;}};
}
type ArtifactOptionsVerify=(binding:RunBinding,refs:readonly ArtifactEvidence[])=>Promise<void>;
test('an explicit judgment is durably published and read back with its exact evidence and original qualification',async()=>{
 const f=fixture();try{
  const saved=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'publish-first',reason:'Initial limited judgment',content:judgment()});
  const read=await f.artifacts.read(f.binding,{artifactId:saved.artifactId,version:1});
  assert.equal(read.content.summary,'Evidence supports a limited judgment');assert.equal(read.version,1);assert.deepEqual(read.content.evidence,evidence);assert.equal(read.goalRevision,1);assert.equal(read.epoch,1);assert.equal(read.supersedes,null);
 }finally{f.store.close();}
});
test('a revised judgment appends a version while the exact original remains readable',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'first',reason:'Initial judgment',content:judgment('Original limited judgment')});
  const second=await f.artifacts.save(f.binding,{artifactId:first.artifactId,expectedVersion:1,requestId:'second',reason:'New exact evidence changes the judgment',content:judgment('Revised limited judgment')});
  assert.equal(second.artifactId,first.artifactId);assert.equal(second.version,2);assert.deepEqual(second.supersedes,{artifactId:first.artifactId,version:1});
  assert.equal((await f.artifacts.read(f.binding,{artifactId:first.artifactId,version:1})).content.summary,'Original limited judgment');
  assert.equal((await f.artifacts.read(f.binding,{artifactId:first.artifactId,version:2})).content.summary,'Revised limited judgment');
  await assert.rejects(f.artifacts.save(f.binding,{artifactId:first.artifactId,expectedVersion:1,requestId:'stale',reason:'Stale overwrite attempt',content:judgment('Must not overwrite version 2')}),{code:'artifact_conflict'});
  assert.equal(f.artifacts.history().length,2);
 }finally{f.store.close();}
});
test('an identical publication survives reopen without appending a second version and conflicting reuse is rejected',async()=>{
 mkdirSync(resolve('.local/tests'),{recursive:true});const directory=mkdtempSync(join(resolve('.local/tests'),'artifacts-'));const filename=join(directory,'business.sqlite');
 const input={expectedVersion:0,requestId:'durable-request',reason:'Initial durable judgment',content:judgment()};
 const first=fixture(filename);let saved;
 try{saved=await first.artifacts.save(first.binding,input);}finally{first.store.close();}
 const reopened=fixture(filename);try{
  assert.deepEqual(await reopened.artifacts.save(reopened.binding,input),saved);assert.equal(reopened.artifacts.history().length,1);
  await assert.rejects(reopened.artifacts.save(reopened.binding,{...input,content:judgment('Conflicting operation reuse')}),{code:'artifact_request_conflict'});
  assert.equal(reopened.artifacts.history().length,1);
 }finally{reopened.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('a historical revision retains its bytes while a new goal or evidence epoch cannot read its body',async()=>{
 const f=fixture();try{
  const saved=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'first',reason:'Initial judgment',content:judgment('Original source-derived body')});
  await assert.rejects(f.artifacts.read({...f.binding,epoch:2},saved),{code:'artifact_historical'});
  f.store.adjust(owner,f.d.id,{expectedVersion:1,idempotencyKey:'adjust',goal:'A different synthetic goal'});
  const newGoal={...f.binding,goalRevision:2};await assert.rejects(f.artifacts.read(newGoal,saved),{code:'artifact_historical'});
  const list=await f.artifacts.list(newGoal);assert.equal(list[0].qualification,'historical');assert.equal(JSON.stringify(list).includes('Original source-derived body'),false);assert.equal(JSON.stringify(list).includes('synthetic-source'),false);
  assert.equal(f.artifacts.history()[0].content.summary,'Original source-derived body');
 }finally{f.store.close();}
});
test('a plan preserves alternatives and observation terms while malformed or undeclared business claims are rejected',async()=>{
 const f=fixture();try{
  const base=judgment();
  const incomplete={...base,kind:'plan'} as unknown as ArtifactContent;
  await assert.rejects(f.artifacts.save(f.binding,{expectedVersion:0,requestId:'incomplete',reason:'Missing plan terms',content:incomplete}),{code:'artifact_invalid'});
  await assert.rejects(f.artifacts.save(f.binding,{expectedVersion:0,requestId:'undeclared',reason:'Undeclared adoption claim',content:{...base,adopted:true} as unknown as ArtifactContent}),{code:'artifact_invalid'});
  await assert.rejects(f.artifacts.save(f.binding,{expectedVersion:0,requestId:'bad-evidence',reason:'Malformed exact identity',content:{...base,evidence:[{ref:'source',hash:'latest'}]}}),{code:'artifact_invalid'});
  const content:ArtifactContent={...base,kind:'plan',recommendation:'Observe before acting',alternatives:[{option:'Keep current position',costs:'No additional synthetic resource',risks:'May miss an unconfirmed change'}],constraints:['No enterprise actions'],observation:{baseline:'Unknown; no enterprise material',expectedChange:'Unknown',measure:'Authorized observation only',window:'After an authorized update',source:'Synthetic exact source',check:'Reassess on conflicting evidence'}};
  const saved=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'complete',reason:'A bounded synthetic proposal',content});
  assert.deepEqual((await f.artifacts.read(f.binding,saved)).content,content);assert.equal(f.artifacts.history().length,1);
 }finally{f.store.close();}
});
test('source qualification failures expose a fixed error rather than raw provider or source diagnostics',async()=>{
 const f=fixture();try{
  const marker='synthetic-untrusted-diagnostic';f.setVerify(async()=>{throw new Error(marker);});
  await assert.rejects(f.artifacts.save(f.binding,{expectedVersion:0,requestId:'denied',reason:'Unavailable exact source',content:judgment()}),(error:unknown)=>{assert.equal((error as {code?:string}).code,'artifact_evidence_unavailable');assert.equal(String(error).includes(marker),false);assert.equal((error as Error).cause,undefined);return true;});
  assert.equal(f.artifacts.history().length,0);
 }finally{f.store.close();}
});
test('an asynchronous publication keeps its admitted identity detached from later caller mutation',async()=>{
 const f=fixture();try{
  let release!:()=>void;f.setVerify(async()=>new Promise<void>(resolve=>{release=resolve;}));
  const mutable={...f.binding};const pending=f.artifacts.save(mutable,{expectedVersion:0,requestId:'detached',reason:'Detached identity',content:judgment()});
  mutable.epoch=2;mutable.generation=99;release();const result=await pending;
  assert.equal(result.epoch,1);assert.equal(result.actor.generation,1);
 }finally{f.store.close();}
});
test('an enclosing business transaction cannot hold a lock across asynchronous source verification',async()=>{
 const f=fixture();try{
  let verifications=0;f.setVerify(async()=>{verifications++;});let pending!:Promise<unknown>;
  f.store.withTransaction(()=>{pending=f.artifacts.save(f.binding,{expectedVersion:0,requestId:'outer',reason:'No async work under outer transaction',content:judgment()});});
  await assert.rejects(pending,{code:'artifact_transaction'});assert.equal(verifications,0);assert.equal(f.artifacts.history().length,0);
 }finally{f.store.close();}
});
test('follow-up eligibility points to the latest qualified revision without forbidding exact old-version comparisons',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'first',reason:'Initial judgment',content:judgment()});
  assert.equal(f.artifacts.isCurrentReference(f.binding,first),true);
  const second=await f.artifacts.save(f.binding,{artifactId:first.artifactId,expectedVersion:1,requestId:'second',reason:'Revised judgment',content:judgment('Changed judgment')});
  assert.equal(f.artifacts.isCurrentReference(f.binding,first),false);assert.equal(f.artifacts.isCurrentReference(f.binding,second),true);
  assert.equal((await f.artifacts.read(f.binding,first)).version,1);
  assert.equal(f.artifacts.isCurrentReference({...f.binding,epoch:2},second),false);
  f.setCurrent(false);assert.equal(f.artifacts.isCurrentReference(f.binding,second),false);
 }finally{f.store.close();}
});
test('foreign owners and delegates cannot read or append to an existing artifact',async()=>{
 const f=fixture();try{
  const saved=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'first',reason:'Initial judgment',content:judgment()});
  await assert.rejects(f.artifacts.read({...f.binding,owner:{...owner,principalId:'another-operator'}},saved),{code:'artifact_unqualified'});
  await assert.rejects(f.artifacts.list({...f.binding,delegationId:'foreign-delegation'}),{code:'artifact_unqualified'});
  const other=f.store.create(owner,{goal:'Another synthetic delegation',idempotencyKey:'other'});const otherBinding={...f.binding,delegationId:other.id};
  const otherArtifacts=new ArtifactStore(f.store,{owner,delegationId:other.id},{isCurrent:()=>true,verifyEvidence:async()=>{}});
  await assert.rejects(otherArtifacts.read(otherBinding,saved),{code:'artifact_not_found'});
  await assert.rejects(otherArtifacts.save(otherBinding,{artifactId:saved.artifactId,expectedVersion:1,requestId:'foreign-append',reason:'Must not cross delegation',content:judgment()}),{code:'artifact_not_found'});
  assert.equal(otherArtifacts.history().length,0);assert.equal(f.artifacts.history().length,1);
 }finally{f.store.close();}
});
test('revocation or lifecycle change during evidence verification returns no body and commits no new version',async()=>{
 const f=fixture();try{
  const saved=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'first',reason:'Initial judgment',content:judgment()});
  let release!:()=>void;f.setVerify(async()=>new Promise<void>(resolve=>{release=resolve;}));
  const pendingRead=f.artifacts.read(f.binding,saved);f.setCurrent(false);release();await assert.rejects(pendingRead,{code:'artifact_unqualified'});
  f.setCurrent(true);const pendingWrite=f.artifacts.save(f.binding,{artifactId:saved.artifactId,expectedVersion:1,requestId:'late',reason:'Late publication',content:judgment('Must not commit after pause')});
  f.store.requestLifecycle(owner,f.d.id,{expectedVersion:1,action:'pause',idempotencyKey:'pause'});release();await assert.rejects(pendingWrite,{code:'artifact_unqualified'});
  assert.equal(f.artifacts.history().length,1);await assert.rejects(f.artifacts.list(f.binding),{code:'artifact_unqualified'});
 }finally{f.store.close();}
});
test('changed exact evidence blocks a body read even while metadata remains in the same goal and epoch',async()=>{
 const f=fixture();try{
  const saved=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'first',reason:'Initial judgment',content:judgment()});
  f.setVerify(async()=>{throw new Error('Synthetic source no longer qualified');});
  const list=await f.artifacts.list(f.binding);assert.equal(list[0].qualification,'current');assert.equal('content' in list[0],false);assert.equal('title' in list[0],false);
  await assert.rejects(f.artifacts.read(f.binding,saved),{code:'artifact_evidence_unavailable'});
 }finally{f.store.close();}
});
test('two real SQLite connections cannot both append against one expected artifact version',async()=>{
 mkdirSync(resolve('.local/tests'),{recursive:true});const directory=mkdtempSync(join(resolve('.local/tests'),'artifacts-cas-'));const filename=join(directory,'business.sqlite');
 const first=fixture(filename),second=fixture(filename);try{
  const saved=await first.artifacts.save(first.binding,{expectedVersion:0,requestId:'initial',reason:'Initial judgment',content:judgment()});
  const results=await Promise.allSettled([first.artifacts.save(first.binding,{artifactId:saved.artifactId,expectedVersion:1,requestId:'left',reason:'Left append',content:judgment('Left revision')}),second.artifacts.save(second.binding,{artifactId:saved.artifactId,expectedVersion:1,requestId:'right',reason:'Right append',content:judgment('Right revision')})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);const rejected=results.find(result=>result.status==='rejected');assert.ok(rejected?.status==='rejected');assert.equal((rejected.reason as {code?:string}).code,'artifact_conflict');assert.equal(first.artifacts.history().length,2);assert.equal(second.artifacts.history().length,2);
 }finally{first.store.close();second.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('an initial evidence epoch of zero permits an explicitly limited judgment without fabricated references',async()=>{
 const f=fixture();try{
  const binding={...f.binding,epoch:0};const content={...judgment(),evidence:[],unknowns:['No source has been authorized yet']};
  const saved=await f.artifacts.save(binding,{expectedVersion:0,requestId:'initial-epoch',reason:'Explicitly limited judgment',content});
  assert.equal(saved.epoch,0);assert.equal((await f.artifacts.read(binding,saved)).content.unknowns[0],'No source has been authorized yet');assert.equal(f.artifacts.isCurrentReference(binding,saved),true);
 }finally{f.store.close();}
});
test('business follow-up association survives a native generation change without authorizing an old native reader',async()=>{
 const f=fixture();let generation=1;
 const artifacts=new ArtifactStore(f.store,{owner,delegationId:f.d.id},{isCurrent:binding=>binding.generation===generation,verifyEvidence:async()=>{}});
 try{
  const first=await artifacts.save(f.binding,{expectedVersion:0,requestId:'first',reason:'Initial judgment',content:judgment()});
  generation=2;const current={...f.binding,generation};
  assert.equal(artifacts.isCurrentBusinessReference(first,{goalRevision:1,epoch:1}),true);
  await assert.rejects(artifacts.read(f.binding,first),{code:'artifact_unqualified'});assert.equal(artifacts.isCurrentReference(f.binding,first),false);assert.equal(artifacts.isCurrentReference(current,first),true);
  const second=await artifacts.save(current,{artifactId:first.artifactId,expectedVersion:1,requestId:'second',reason:'Current reader revised judgment',content:judgment('New qualified revision')});
  assert.equal(artifacts.isCurrentBusinessReference(first,{goalRevision:1,epoch:1}),false);assert.equal(artifacts.isCurrentBusinessReference(second,{goalRevision:1,epoch:1}),true);assert.equal(artifacts.isCurrentBusinessReference(second,{goalRevision:1,epoch:2}),false);
  f.store.adjust(owner,f.d.id,{expectedVersion:1,idempotencyKey:'change-goal',goal:'A different qualified goal'});
  assert.equal(artifacts.isCurrentBusinessReference(second,{goalRevision:1,epoch:1}),false);assert.equal(artifacts.isCurrentBusinessReference(second,{goalRevision:2,epoch:1}),false);
 }finally{f.store.close();}
});
