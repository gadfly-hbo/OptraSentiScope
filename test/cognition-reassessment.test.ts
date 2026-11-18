import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import type {ArtifactContent,ArtifactOptions} from '../src/artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

const owner={enterpriseId:'cognition-artifact-fixture',principalId:'operator'};
const judgment:ArtifactContent={kind:'judgment',title:'Original bounded judgment',summary:'The original mechanism only supports the declared synthetic scope',evidence:[{ref:'synthetic/original.txt',hash:'1'.repeat(64)}],assumptions:['Synthetic engineering only'],unknowns:['Business effectiveness unknown'],applicability:'Only the declared synthetic scope',invalidatedBy:['A later authorized counterexample']};
function fixture(){
 const store=new SentiStore({filename:':memory:'}),d=store.create(owner,{goal:'Synthetic cognition correction',idempotencyKey:'create'});
 let epoch=1,current=true,available=true;
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch,generation:1,role:'main'};
 const options:ArtifactOptions={isCurrent:b=>current&&b.epoch===epoch,currentEpoch:()=>epoch,verifyEvidence:async()=>{if(!available)throw new Error('source revoked');},now:()=>'2026-11-17T12:00:00.000Z'};
 const artifacts=new ArtifactStore(store,{owner,delegationId:d.id},options);
 return{store,d,artifacts,binding,setEpoch(value:number){epoch=value;},setCurrent(value:boolean){current=value;},setAvailable(value:boolean){available=value;}};
}

test('reassessment reads one exact old ordinary artifact after a source epoch change without widening ordinary read',async()=>{
 const f=fixture();try{
  const saved=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'judgment-v1',reason:'Initial bounded judgment',content:judgment});
  f.setEpoch(2);const reassessing={...f.binding,epoch:2};
  await assert.rejects(f.artifacts.read(reassessing,saved),{code:'artifact_historical'});
  const result=await f.artifacts.reassessment(reassessing,saved);
  assert.equal(result.status,'qualified');
  assert.equal(result.revision.artifactId,saved.artifactId);
  assert.equal(result.revision.version,1);
  assert.equal(result.accessQualification,'historical');
  assert.equal(result.useQualification,'historical');
  assert.equal(result.reassessmentDue,true);
  assert.deepEqual(result.revision.content,judgment);

  const currentRevision=await f.artifacts.save({...f.binding,epoch:2},{expectedVersion:0,requestId:'judgment-current-epoch',reason:'A new exact judgment establishes current access',content:{...judgment,summary:'A current exact judgment'}});
  const sameEpoch=await f.artifacts.reassessment({...f.binding,epoch:2},currentRevision);
  assert.equal(sameEpoch.accessQualification,'current');
  assert.equal(sameEpoch.useQualification,'current');
 }finally{f.store.close();}
});

test('reassessment returns only safe metadata and unknowns when the exact original source is unavailable',async()=>{
 const f=fixture();try{
  const saved=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'judgment-v1',reason:'Initial bounded judgment',content:judgment});
  f.setAvailable(false);const result=await f.artifacts.reassessment(f.binding,saved);
  assert.equal(result.status,'unavailable');
  assert.equal(result.artifactId,saved.artifactId);
  assert.equal(result.version,1);
  assert.equal(result.kind,'judgment');
  assert.equal(result.goalRevision,1);
  assert.equal(result.epoch,1);
  assert.equal(result.accessQualification,'unavailable');
  assert.equal(result.useQualification,'unavailable');
  assert.equal(result.reassessmentDue,true);
  assert.equal('content' in result,false);
  assert.equal('title' in result,false);
  assert.equal('summary' in result,false);
  assert.equal(result.restriction,'artifact_evidence_unavailable');
  assert.ok(result.unknowns.length>0);
 }finally{f.store.close();}
});
