import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {CognitionStore} from '../src/cognition.ts';
import type {ArtifactContent,ArtifactReference,ArtifactRevision} from '../src/artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';

const owner={enterpriseId:'cognition-p1-fixture',principalId:'operator'};
const revision=(artifactId:string,kind:'judgment'|'plan',version=1):ArtifactRevision=>({artifactId,version,kind,content:{kind,title:`${kind} ${artifactId}`,summary:'Synthetic',evidence:[],assumptions:[],unknowns:[],applicability:'Synthetic',invalidatedBy:[],...(kind==='plan'?{recommendation:'Synthetic',alternatives:[{option:'Wait',costs:'None',risks:'Unknown'}],constraints:[],observation:{baseline:'None',expectedChange:'Unknown',measure:'Synthetic',window:'Later',source:'Synthetic',check:'Later'}}:{})} as ArtifactContent,reason:'Synthetic',createdAt:'2026-11-18T02:00:00.000Z',goalRevision:1,epoch:0,actor:{role:'main',generation:1},supersedes:null});
const reference=(artifactId:string,version=1):ArtifactReference=>({artifactId,version});
function fixture(filename=':memory:',reopen=false){
 const store=new SentiStore({filename}),delegation=reopen?store.list(owner)[0]:store.create(owner,{goal:'Synthetic P1',idempotencyKey:'create'}),binding:RunBinding={owner,delegationId:delegation.id,goalRevision:1,epoch:0,generation:1,role:'main'};
 const revisions=new Map<string,ArtifactRevision>();const qualified=(ref:ArtifactReference)=>({status:'qualified' as const,revision:revisions.get(ref.artifactId)!,accessQualification:'current' as const,useQualification:'current' as const,reassessmentDue:true as const,checkedAt:'2026-11-18T02:00:00.000Z'});
 const cognition=new CognitionStore(store,{owner,delegationId:delegation.id},{isCurrent:()=>true,currentEpoch:()=>0,isLatestPlan:(ref)=>revisions.get(ref.artifactId)?.version===ref.version,artifactKind:ref=>revisions.get(ref.artifactId)?.kind,verifyArtifact:async(_b,ref)=>qualified(ref),verifyTrigger:async()=>{},revalidateTrigger:()=>true,now:()=>'2026-11-18T02:00:00.000Z'});
 return{store,binding,cognition,put(value:ArtifactRevision){revisions.set(value.artifactId,value);},setVersion(artifactId:string,version:number){const value=revisions.get(artifactId)!;revisions.set(artifactId,{...value,version});}};
}

test('support request replay returns the original receipt across reopen with the same normalized input',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-cognition-p1-')),filename=join(directory,'business.sqlite'),first=fixture(filename);let saved;try{
  first.put(revision('judgment-a','judgment'));first.put(revision('plan-c','plan'));
  const input={requestId:'support-a-c',judgment:reference('judgment-a'),plan:reference('plan-c'),scope:'A supports C through B',why:'Declared mechanism precondition',reason:'Synthetic declaration',status:'active' as const};
  saved=await first.cognition.saveSupport(first.binding,input);
  await assert.rejects(first.cognition.saveSupport(first.binding,{...input,scope:'Different scope'}),{code:'cognition_conflict'});
  const replay=await first.cognition.saveSupport(first.binding,input);assert.deepEqual(replay,saved);
 }finally{first.store.close();}
 const reopened=fixture(filename,true);try{
  reopened.put(revision('judgment-a','judgment'));reopened.put(revision('plan-c','plan'));
  const replay=await reopened.cognition.saveSupport(reopened.binding,{requestId:'support-a-c',judgment:reference('judgment-a'),plan:reference('plan-c'),scope:'A supports C through B',why:'Declared mechanism precondition',reason:'Synthetic declaration',status:'active'});
  assert.deepEqual(replay,saved);
 }finally{reopened.store.close();rmSync(directory,{recursive:true,force:true});}
});

test('declared A-to-B and B-to-plan support reaches only the scoped dependent plan without cycles or duplicate paths',async()=>{
 const f=fixture();try{
  for(const id of ['judgment-a','judgment-b','judgment-c-loop'])f.put(revision(id,'judgment'));
  f.put(revision('plan-c','plan'));f.put(revision('plan-unrelated','plan'));
  await f.cognition.saveSupport(f.binding,{requestId:'a-b',judgment:reference('judgment-a'),plan:reference('judgment-b'),scope:'A mechanism supports B',why:'Declared judgment dependency',reason:'Agent declared edge',status:'active'});
  await f.cognition.saveSupport(f.binding,{requestId:'b-c',judgment:reference('judgment-b'),plan:reference('plan-c'),scope:'B mechanism supports C',why:'Declared plan dependency',reason:'Agent declared edge',status:'active'});
  await f.cognition.saveSupport(f.binding,{requestId:'c-a-cycle',judgment:reference('judgment-c-loop'),plan:reference('judgment-a'),scope:'Cycle edge',why:'Cycle must terminate',reason:'Synthetic cycle',status:'active'});
  await f.cognition.saveSupport(f.binding,{requestId:'other-unrelated',judgment:reference('judgment-c-loop'),plan:reference('plan-unrelated'),scope:'Unrelated',why:'Unrelated path',reason:'Synthetic',status:'active'});
  const review=await f.cognition.review(f.binding,{requestId:'review-a',judgment:reference('judgment-a'),trigger:{kind:'source_event',eventId:'event-a',sourceId:'source',observedAt:'2026-11-18T02:00:00.000Z'},conclusion:'limited',summary:'A changed',reason:'A affects its dependent chain',changes:['A changed'],limitations:[],unknowns:[],nextReview:{condition:'After C'}});
  assert.equal(review.reevaluations.length,1);assert.deepEqual(review.reevaluations[0].plan,reference('plan-c'));assert.ok(review.reevaluations[0].scope.includes('A mechanism supports B'));assert.ok(review.reevaluations[0].scope.includes('B mechanism supports C'));
 }finally{f.store.close();}
});
