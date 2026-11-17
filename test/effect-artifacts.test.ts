import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import type {ArtifactContent,ArtifactOptions} from '../src/artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

const owner={enterpriseId:'effect-artifact-fixture',principalId:'operator'};
const effect={plan:{artifactId:'original-plan',version:1},choiceId:'original-choice',execution:{id:'execution-original',revision:1},observation:{id:'observation-original',revision:1},scope:'Only the observed portion of the selected scope',evidenceConnection:'The observation follows partial execution, but the temporal relation alone does not establish a cause',competingExplanations:['An independent external change remains possible'],limitations:['The declared observation window is not mature']};
const judgment={kind:'judgment' as const,title:'Limited synthetic effect judgment',summary:'Observed improvement; causal effect remains unknown',evidence:[],assumptions:['Synthetic engineering only'],unknowns:['Operating effectiveness remains unknown'],applicability:'Only the exact selected scope and observed period',invalidatedBy:['New authorized counterevidence'],effect};
type VerifyEffect=NonNullable<ArtifactOptions['verifyEffect']>;
function fixture(filename=':memory:'){
 const store=new SentiStore({filename}),d=store.create(owner,{goal:'Synthetic bounded effect assessment',idempotencyKey:'create'});
 let current=true,epoch=0,effectCurrent=true;let verify:VerifyEffect=async()=>{};let verifyEvidence:ArtifactOptions['verifyEvidence']=async()=>{};
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main'};
 const options={isCurrent:(b:RunBinding)=>current&&b.epoch===epoch,currentEpoch:()=>epoch,verifyEvidence:async(b:RunBinding,e:Parameters<ArtifactOptions['verifyEvidence']>[1])=>verifyEvidence(b,e),verifyEffect:async(b:RunBinding,e:Parameters<VerifyEffect>[1])=>verify(b,e),isEffectCurrent:(_e:Parameters<VerifyEffect>[1],q:{goalRevision:number;epoch:number})=>effectCurrent&&q.epoch===epoch,now:()=> '2026-11-17T12:00:00.000Z'};
 const artifacts=new ArtifactStore(store,{owner,delegationId:d.id},options);
 return{store,d,binding,artifacts,options,setCurrent:(v:boolean)=>{current=v;},setEpoch:(v:number)=>{epoch=v;},setEffectCurrent:(v:boolean)=>{effectCurrent=v;},setVerify:(v:VerifyEffect)=>{verify=v;},setEvidence:(v:ArtifactOptions['verifyEvidence'])=>{verifyEvidence=v;}};
}
const input={expectedVersion:0,requestId:'effect-first',reason:'Initial limited effect judgment',content:judgment as ArtifactContent};

test('an effect judgment uses immutable artifact versions and preserves exact plan, choice, execution and observation references',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,input);assert.equal(first.kind,'judgment');assert.equal(first.version,1);
  assert.deepEqual(first.content,judgment);assert.deepEqual((await f.artifacts.read(f.binding,first)).content,judgment);
  assert.equal(f.artifacts.isEffectQualified(first,{goalRevision:1,epoch:0}),true);
  const meta=await f.artifacts.list(f.binding);assert.equal(meta[0].effect,true);assert.equal(JSON.stringify(meta).includes('external change'),false);
  assert.equal(f.artifacts.history().length,1);
 }finally{f.store.close();}
});

test('one effect judgment cannot move to another plan or choice or turn into an ordinary artifact',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,input);
  for(const changed of [{...effect,choiceId:'another-choice'},{...effect,plan:{artifactId:'another-plan',version:1}}])await assert.rejects(f.artifacts.save(f.binding,{...input,artifactId:first.artifactId,expectedVersion:1,requestId:`move-${changed.choiceId}-${changed.plan.artifactId}`,content:{...judgment,effect:changed}}),{code:'artifact_effect_association'});
  const {effect:_effect,...ordinary}=judgment;
  await assert.rejects(f.artifacts.save(f.binding,{...input,artifactId:first.artifactId,expectedVersion:1,requestId:'drop-effect',content:ordinary}),{code:'artifact_effect_association'});
  const normal=await f.artifacts.save(f.binding,{...input,requestId:'ordinary',content:ordinary});
  await assert.rejects(f.artifacts.save(f.binding,{...input,artifactId:normal.artifactId,expectedVersion:1,requestId:'convert-ordinary'}),{code:'artifact_effect_association'});
  const second=await f.artifacts.save(f.binding,{...input,artifactId:first.artifactId,expectedVersion:1,requestId:'effect-second',reason:'New explicit limited judgment',content:{...judgment,summary:'Still limited after another exact observation',effect:{...effect,observation:{id:effect.observation.id,revision:2}}}});
  assert.equal(second.version,2);assert.deepEqual(second.supersedes,{artifactId:first.artifactId,version:1});
  assert.equal((await f.artifacts.read(f.binding,first)).content.summary,judgment.summary);assert.equal(f.artifacts.history().length,3);
 }finally{f.store.close();}
});

test('worker and foreign access cannot read or write an effect or poison the main Agent qualification',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,input),worker={...f.binding,role:'worker' as const,assignmentId:'synthetic-assignment'};
  await assert.rejects(f.artifacts.read(worker,first),{code:'artifact_effect_role'});
  assert.equal(f.artifacts.isEffectQualified(first,f.binding),true,'An unauthorized read cannot invalidate authorized main access');
  await assert.rejects(f.artifacts.save(worker,{...input,requestId:'worker-effect'}),{code:'artifact_effect_role'});
  await assert.rejects(f.artifacts.read({...f.binding,owner:{...owner,principalId:'other'}},first),{code:'artifact_unqualified'});
  const {effect:_effect,...ordinary}=judgment;const normal=await f.artifacts.save(worker,{...input,requestId:'worker-ordinary',content:ordinary});assert.equal((await f.artifacts.read(worker,normal)).content.summary,ordinary.summary);
  const list=await f.artifacts.list(worker);assert.equal(list.find(v=>v.artifactId===first.artifactId)?.qualification,'unavailable');
 }finally{f.store.close();}
});

test('a failed exact replay withdraws the old qualification instead of reviving the saved effect body',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,input);f.setEvidence(async()=>{throw Error('SYNTHETIC_PRIVATE_DIAGNOSTIC');});
  await assert.rejects(f.artifacts.save(f.binding,input),(error:unknown)=>{assert.equal((error as {code:string}).code,'artifact_evidence_unavailable');assert.equal(String(error).includes('SYNTHETIC_PRIVATE_DIAGNOSTIC'),false);return true;});
  assert.equal(f.artifacts.isEffectQualified(first,f.binding),false);assert.equal(f.artifacts.history()[0].content.summary,judgment.summary);
  f.setEvidence(async()=>{});assert.deepEqual(await f.artifacts.save(f.binding,input),first);assert.equal(f.artifacts.isEffectQualified(first,f.binding),true);assert.equal(f.artifacts.history().length,1);
 }finally{f.store.close();}
});

test('new source epochs need complete exact revalidation and a current failure removes the previous effect qualification',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,input);const {effect:_effect,...ordinary}=judgment;const normal=await f.artifacts.save(f.binding,{...input,requestId:'ordinary',content:ordinary});
  f.setEpoch(1);const current={...f.binding,epoch:1};assert.equal(f.artifacts.isEffectQualified(first,f.binding),false);assert.equal(f.artifacts.isEffectQualified(first,current),false);
  assert.equal((await f.artifacts.list(current)).find(v=>v.artifactId===first.artifactId)?.qualification,'unavailable');
  await assert.rejects(f.artifacts.read(current,normal),{code:'artifact_historical'});
  const read=await f.artifacts.read(current,first);assert.equal(read.epoch,0);assert.deepEqual(read.content,judgment);assert.equal(f.artifacts.isEffectQualified(first,current),true);
  f.setVerify(async()=>{throw Error('SYNTHETIC_HIDDEN_ORIGINAL_PLAN_SOURCE');});await assert.rejects(f.artifacts.read(current,first),(error:unknown)=>{assert.equal((error as {code:string}).code,'artifact_effect_unavailable');assert.equal(String(error).includes('HIDDEN_ORIGINAL'),false);return true;});
  assert.equal(f.artifacts.isEffectQualified(first,current),false);f.setVerify(async()=>{});assert.equal(f.artifacts.isEffectQualified(first,current),false);
  assert.equal((await f.artifacts.read(current,first)).epoch,0);assert.equal(f.artifacts.isEffectQualified(first,current),true);
  f.setEffectCurrent(false);assert.equal(f.artifacts.isEffectQualified(first,current),false);await assert.rejects(f.artifacts.read(current,first),{code:'artifact_effect_unavailable'});
  assert.deepEqual(f.artifacts.history().find(v=>v.artifactId===first.artifactId)?.content,judgment);
 }finally{f.store.close();}
});

test('exact technical retries remain identical when object key order changes and malformed effect references are rejected',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,input);
  const reordered={...judgment,effect:{limitations:effect.limitations,observation:{revision:1,id:effect.observation.id},scope:effect.scope,competingExplanations:effect.competingExplanations,evidenceConnection:effect.evidenceConnection,execution:{revision:1,id:effect.execution.id},choiceId:effect.choiceId,plan:{version:1,artifactId:effect.plan.artifactId}}};
  assert.deepEqual(await f.artifacts.save(f.binding,{...input,content:reordered}),first);assert.equal(f.artifacts.history().length,1);
  for(const invalid of [{...effect,plan:{artifactId:'plan',version:0}},{...effect,execution:{id:'execution',revision:'latest'}},{...effect,observation:{id:'observation',revision:0}},{...effect,evidenceConnection:''},{...effect,confidence:99}])await assert.rejects(f.artifacts.save(f.binding,{...input,requestId:'invalid',content:{...judgment,effect:invalid} as ArtifactContent}),{code:'artifact_invalid'});
  assert.equal(f.artifacts.history().length,1);
 }finally{f.store.close();}
});

test('an asynchronous check retains the admitted input and cannot commit after generation or effect qualification changes',async()=>{
 const f=fixture();try{
  let release!:()=>void,started!:()=>void;let reached=new Promise<void>(r=>{started=r;});f.setVerify(async()=>{started();await new Promise<void>(r=>{release=r;});});
  const mutable=structuredClone(input),binding={...f.binding};const pending=f.artifacts.save(binding,mutable);await reached;
  binding.generation=99;(mutable.content as typeof judgment).effect.plan.version=99;(mutable.content as typeof judgment).effect.limitations[0]='Caller mutated limitation';release();const first=await pending;
  assert.equal(first.actor.generation,1);assert.deepEqual(first.content,judgment);
  reached=new Promise<void>(r=>{started=r;});const late=f.artifacts.save(f.binding,{...input,artifactId:first.artifactId,expectedVersion:1,requestId:'late',content:{...judgment,summary:'Must not commit after a changed native generation'}});await reached;f.setCurrent(false);release();await assert.rejects(late,{code:'artifact_unqualified'});assert.equal(f.artifacts.history().length,1);
  f.setCurrent(true);reached=new Promise<void>(r=>{started=r;});const stale=f.artifacts.save(f.binding,{...input,artifactId:first.artifactId,expectedVersion:1,requestId:'stale',content:{...judgment,summary:'Must not commit after a changed exact result qualification'}});await reached;f.setEffectCurrent(false);release();await assert.rejects(stale,{code:'artifact_effect_unavailable'});assert.equal(f.artifacts.history().length,1);
 }finally{f.store.close();}
});

test('missing effect authority, active lifecycle and goal scope cannot be bypassed through ordinary artifact access',async()=>{
 const f=fixture();try{
  const first=await f.artifacts.save(f.binding,input);
  const unavailable=new ArtifactStore(f.store,{owner,delegationId:f.d.id},{isCurrent:()=>true,verifyEvidence:async()=>{}});
  await assert.rejects(unavailable.save(f.binding,{...input,requestId:'without-authority'}),{code:'artifact_effect_unavailable'});
  await assert.rejects(unavailable.read(f.binding,first),{code:'artifact_effect_unavailable'});assert.equal(unavailable.isEffectQualified(first,f.binding),false);
  await f.artifacts.read(f.binding,first);assert.equal(f.artifacts.isEffectQualified(first,f.binding),true);
  await assert.rejects(f.artifacts.readForOutcome(f.binding,first),{code:'artifact_historical'});
  const pausing=f.store.requestLifecycle(owner,f.d.id,{expectedVersion:f.store.get(owner,f.d.id).version,action:'pause',idempotencyKey:'pause'});
  await assert.rejects(f.artifacts.read(f.binding,first),{code:'artifact_unqualified'});assert.equal(f.artifacts.isEffectQualified(first,f.binding),true,'Authorized Host history can remain read-only while paused');
  assert.ok(pausing.pendingOperation);const paused=f.store.completeLifecycle(owner,f.d.id,{operationId:pausing.pendingOperation.id,expectedVersion:pausing.version,outcome:'stopped',evidence:'Synthetic exact resources stopped'});
  f.store.requestLifecycle(owner,f.d.id,{expectedVersion:paused.version,action:'end',idempotencyKey:'end'});assert.equal(f.artifacts.isEffectQualified(first,f.binding),false);assert.equal(f.artifacts.history().length,1);
 }finally{f.store.close();}
 const g=fixture();try{const first=await g.artifacts.save(g.binding,input);g.store.adjust(owner,g.d.id,{expectedVersion:1,idempotencyKey:'new-goal',goal:'Different synthetic goal'});await assert.rejects(g.artifacts.read({...g.binding,goalRevision:2},first),{code:'artifact_historical'});assert.equal(g.artifacts.isEffectQualified(first,{goalRevision:2,epoch:0}),false);assert.equal(g.artifacts.history()[0].goalRevision,1);}finally{g.store.close();}
});

test('two SQLite consumers compare versions atomically and a reopen preserves exact effect history and replay identity',async()=>{
 mkdirSync(resolve('.local/tests'),{recursive:true});const directory=mkdtempSync(join(resolve('.local/tests'),'effect-artifact-')),filename=join(directory,'business.sqlite');
 const first=fixture(filename),second=fixture(filename);let saved;
 try{
  saved=await first.artifacts.save(first.binding,input);
  const results=await Promise.allSettled([first.artifacts.save(first.binding,{...input,artifactId:saved.artifactId,expectedVersion:1,requestId:'left',content:{...judgment,summary:'Left limited judgment'}}),second.artifacts.save(second.binding,{...input,artifactId:saved.artifactId,expectedVersion:1,requestId:'right',content:{...judgment,summary:'Right limited judgment'}})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failed=results.find(r=>r.status==='rejected');assert.equal(failed?.status==='rejected'&&failed.reason.code,'artifact_conflict');assert.equal(first.artifacts.history().length,2);
 }finally{first.store.close();second.store.close();}
 const reopened=fixture(filename);try{assert.deepEqual(await reopened.artifacts.save({...reopened.binding,generation:2},input),saved);assert.equal(reopened.artifacts.history().length,2);assert.equal(reopened.artifacts.isEffectQualified(saved!,reopened.binding),true);assert.deepEqual((await reopened.artifacts.read(reopened.binding,saved!)).content,judgment);}finally{reopened.store.close();}
});

test('effect verification never holds a business transaction across an external source check',async()=>{
 const f=fixture();try{
  let pending!:Promise<unknown>;f.store.withTransaction(()=>{pending=f.artifacts.save(f.binding,input);});
  await assert.rejects(pending,{code:'artifact_transaction'});assert.equal(f.artifacts.history().length,0);
  const first=await f.artifacts.save(f.binding,input);assert.equal(f.artifacts.isEffectQualified(first,f.binding),true);
 }finally{f.store.close();}
});
