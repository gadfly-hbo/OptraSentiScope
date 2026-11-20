import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {CognitionStore} from '../src/cognition.ts';
import type {CognitionTrigger,SaveCognitionReview,SaveSupportRelation} from '../src/cognition.ts';
import type {ArtifactReassessment,ArtifactRevision} from '../src/artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

const owner={enterpriseId:'cognition-store-fixture',principalId:'operator'};
const judgmentRevision:ArtifactRevision={artifactId:'judgment-one',version:1,kind:'judgment',content:{kind:'judgment',title:'Synthetic judgment',summary:'Synthetic support',evidence:[],assumptions:[],unknowns:[],applicability:'Synthetic',invalidatedBy:[]},reason:'Initial',createdAt:'2026-11-17T12:00:00.000Z',goalRevision:1,epoch:0,actor:{role:'main',generation:1},supersedes:null};
const planRevision:ArtifactRevision={...judgmentRevision,artifactId:'plan-one',kind:'plan',content:{kind:'plan',title:'Synthetic plan',summary:'Synthetic plan',evidence:[],assumptions:[],unknowns:[],applicability:'Synthetic',invalidatedBy:[],recommendation:'Synthetic',alternatives:[{option:'Wait',costs:'None',risks:'Unknown'}],constraints:[],observation:{baseline:'None',expectedChange:'Unknown',measure:'Synthetic',window:'Later',source:'Synthetic',check:'Later'}}};
function fixture(){
 const store=new SentiStore({filename:':memory:'}),d=store.create(owner,{goal:'Synthetic cognition store',idempotencyKey:'create'});const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main'};
 let triggerCurrent=true,gate!:Promise<void>,release!:()=>void;
 const qualified=(revision:ArtifactRevision):ArtifactReassessment=>({status:'qualified',revision,accessQualification:'current',useQualification:'current',reassessmentDue:true,checkedAt:'2026-11-17T12:00:00.000Z'});
 const cognition=new CognitionStore(store,{owner,delegationId:d.id},{isCurrent:()=>true,currentEpoch:()=>0,isLatestPlan:()=>true,artifactKind:ref=>ref.artifactId==='judgment-one'?'judgment':'plan',verifyArtifact:async(_b,ref)=>qualified(ref.artifactId==='judgment-one'?judgmentRevision:planRevision),verifyTrigger:async()=>{await gate;},revalidateTrigger:()=>triggerCurrent,now:()=>'2026-11-17T12:00:00.000Z'});
 const support:SaveSupportRelation={requestId:'support',judgment:{artifactId:'judgment-one',version:1},plan:{artifactId:'plan-one',version:1},scope:'Synthetic scope',why:'Synthetic mechanism precondition',reason:'Synthetic review',status:'active'};
 const trigger:CognitionTrigger={kind:'source_event',eventId:'event-one',sourceId:'source-one',observedAt:'2026-11-17T12:00:00.000Z'};
 const review:SaveCognitionReview={requestId:'review',judgment:{artifactId:'judgment-one',version:1},trigger,conclusion:'limited',summary:'A synthetic counterexample',reason:'Review both plans separately',changes:['Support narrowed'],limitations:['Synthetic'],unknowns:[],nextReview:{condition:'After exact reassessment'}};
 return{store,d,binding,cognition,support,review,setTriggerCurrent(value:boolean){triggerCurrent=value;},block(){gate=new Promise(resolve=>{release=resolve;});},release(){release();}};
}

test('a mutable trigger is synchronously revalidated inside the cognition review commit transaction',async()=>{
 const f=fixture();try{
  await f.cognition.saveSupport(f.binding,f.support);f.block();f.setTriggerCurrent(false);
  const pending=f.cognition.review(f.binding,f.review);f.release();await assert.rejects(pending,{code:'cognition_trigger_stale'});
  assert.equal(f.cognition.reviews().length,0);assert.equal(f.cognition.reevaluations().length,0);
 }finally{f.store.close();}
});

test('plan reassessment enforces the caller exact relation revision before closing work',async()=>{
 const f=fixture();try{
  await f.cognition.saveSupport(f.binding,f.support);const review=await f.cognition.review(f.binding,f.review);const task=review.reevaluations[0];
  await assert.rejects(f.cognition.complete(f.binding,{id:task.id,requestId:'wrong-cas',expectedRelationRevision:task.relation.revision+1,conclusion:'withdraw',reason:'Stale caller',nextSteps:[],unknowns:[]}),{code:'cognition_conflict'});
  assert.equal(f.cognition.reevaluations()[0].status,'pending');
 }finally{f.store.close();}
});

test('the same trigger identity is only deduplicated within one goal and source epoch',async()=>{
 const f=fixture();try{
  await f.cognition.saveSupport(f.binding,f.support);const first=await f.cognition.review(f.binding,f.review);
  const nextBinding={...f.binding,epoch:1};const second=await f.cognition.review(nextBinding,{...f.review,requestId:'review-new-epoch'});
  assert.notEqual(second.id,first.id);assert.equal(second.epoch,1);
  const replay=await f.cognition.review(nextBinding,{...f.review,requestId:'review-new-epoch-replay'});
  assert.equal(replay.id,second.id);assert.equal(f.cognition.reviews().length,2);
 }finally{f.store.close();}
});
