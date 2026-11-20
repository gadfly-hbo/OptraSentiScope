import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

test('outcome access rechecks the selected exact plan under current sources without changing ordinary artifact access',async()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'outcome-artifact-fixture',principalId:'operator'},d=store.create(owner,{goal:'Synthetic exact outcome basis',idempotencyKey:'create'});
 let epoch=0,available=true;const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main'};
 const artifacts=new ArtifactStore(store,{owner,delegationId:d.id},{isCurrent:b=>b.epoch===epoch,verifyEvidence:async()=>{if(!available)throw Error('Synthetic source unavailable');}});
 try{
  const plan=await artifacts.save(binding,{expectedVersion:0,requestId:'original',reason:'Bounded synthetic proposal',content:{kind:'plan',title:'Original selected plan',summary:'Exact original basis',evidence:[],assumptions:[],unknowns:['No business quality claim'],applicability:'Synthetic only',invalidatedBy:['Evidence becomes unavailable'],recommendation:'Observe',alternatives:[{option:'Wait',costs:'Unknown',risks:'Unknown'}],constraints:[],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic',window:'Future',source:'Synthetic only',check:'Recheck'}}});
  epoch=1;const current={...binding,epoch};
  await assert.rejects(artifacts.read(current,plan),{code:'artifact_historical'});
  const read=await artifacts.readForOutcome(current,plan);assert.equal(read.artifactId,plan.artifactId);assert.equal(read.version,1);assert.equal(read.epoch,0);
  available=false;await assert.rejects(artifacts.readForOutcome(current,plan),{code:'artifact_evidence_unavailable'});
  assert.equal(artifacts.history()[0].content.summary,'Exact original basis');
 }finally{store.close();}
});
