import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function boot(){
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'cognition-runtime-fixture',principalId:'operator'},opened=[];
 const native={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,configured:true,async deliver(m){return{accepted:true,messageId:m.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${Math.random()}`,status:'active',...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-cognition-')),sourceFile=join(directory,'fact.txt');writeFileSync(sourceFile,'initial synthetic fact');
 const c=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'},notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5,6,7]}}),d=store.create(owner,{goal:'Synthetic evidence-driven correction',idempotencyKey:'create'});await c.sync(d.id);
 c.configureSources(d.id,[{sourceId:'synthetic-source',directory,grantRevision:1,enabled:true}]);await c.sync(d.id);
 const main=()=>opened.findLast(r=>r.binding.role==='main');
 const invoke=(name,args)=>{const tool=main().options.tools.find(t=>t.name===name);assert.ok(tool,`Missing Agent capability ${name}`);return tool.execute(args,{signal:new AbortController().signal});};
  return{store,owner,c,d,directory,sourceFile,main,invoke,async close(){await c.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}
const artifact=(title,extra={})=>({kind:'plan',title,summary:`${title}: bounded synthetic recommendation`,evidence:[],assumptions:[],unknowns:['Operating effect unknown'],applicability:'Only the explicitly declared synthetic scope',invalidatedBy:['A material counterexample'],recommendation:'Use only the declared synthetic scope',alternatives:[{option:'Wait',costs:'Unknown',risks:'Question remains unresolved'}],constraints:['No operating action'],observation:{baseline:'Synthetic baseline',expectedChange:'Unknown',measure:'Synthetic measure',window:'A future check',source:'Authorized synthetic source',check:'Recheck the exact condition'},...extra});
const judgment={kind:'judgment',title:'Supporting bounded judgment J1',summary:'The mechanism supports P1 and P2 only under the declared condition',evidence:[],assumptions:['Synthetic engineering only'],unknowns:['Business effect unknown'],applicability:'Only the declared synthetic condition',invalidatedBy:['A source event that contradicts the mechanism']};

test('the main Agent records explicit support, revises cognition, and closes each dependent plan re-evaluation independently',async()=>{
 const f=await boot();try{
  const p1=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'p1',reason:'Synthetic P1',content:artifact('P1')});
  const p2=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'p2',reason:'Synthetic P2',content:artifact('P2')});
  const p3=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'p3',reason:'Independent P3',content:artifact('P3')});
  const j1=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'j1',reason:'Initial supporting judgment',content:judgment});
  const choice=await f.invoke('propose_decision',{expectedRevision:0,requestId:'choose-p1',artifact:{artifactId:p1.artifactId,version:1},title:'Choose the original P1 scope',question:'Adopt only the original P1 scope?',options:[{id:'p1',label:'Original P1',scope:'Only original P1',costs:'Unknown',risks:'Evidence can change'}],recommendation:{optionId:'p1',reason:'Original bounded support'},unknowns:['Execution unknown'],nondecisionImpact:'Only dependent operating work waits',nextActions:['Track actual facts separately'],window:{basis:'Synthetic review',nextReviewAt:new Date(Date.now()+600000).toISOString()},reason:'Operating choice is human'});
  await f.c.respondDecision(f.d.id,{id:choice.id,revision:1,artifact:{artifactId:p1.artifactId,version:1},requestId:'choice-p1',action:'partial',optionId:'p1',scope:'Only original P1',text:'Adopt only the original P1 scope'});
  const operatorChoice=f.c.detail(f.d.id).operatorChoices[0];const execution=await f.invoke('record_execution_fact',{expectedRevision:0,requestId:'execution-p1',artifact:{artifactId:p1.artifactId,version:1},choiceId:operatorChoice.id,scope:'Only original P1',status:'unknown',asOf:new Date().toISOString(),extent:'The original choice execution is unknown',evidence:[],statementIds:[],unknowns:['Execution remains unknown'],reason:'Preserve the original fact separately'});
  const relationOne=await f.invoke('declare_support_dependency',{requestId:'support-p1',judgment:{artifactId:j1.artifactId,version:1},plan:{artifactId:p1.artifactId,version:1},scope:'Only the declared P1 scope',why:'The plan depends on J1 as its key mechanism precondition',reason:'Agent reviewed both exact artifacts'});
  const revisedRelation=await f.invoke('declare_support_dependency',{id:relationOne.id,expectedRevision:1,requestId:'support-p1-r2',judgment:{artifactId:j1.artifactId,version:1},plan:{artifactId:p1.artifactId,version:1},scope:'Only the narrowed declared P1 scope',why:'The plan depends on J1 as its key mechanism precondition and applicability condition',reason:'Agent re-read both exact artifacts and narrowed the declared scope',status:'active'});
  assert.equal(revisedRelation.revision,2);assert.deepEqual(revisedRelation.supersedes,{id:relationOne.id,revision:1});
  const relationTwo=await f.invoke('declare_support_dependency',{requestId:'support-p2',judgment:{artifactId:j1.artifactId,version:1},plan:{artifactId:p2.artifactId,version:1},scope:'Only the declared P2 scope',why:'The plan depends on J1 for its applicability condition',reason:'Agent reviewed both exact artifacts'});
  assert.equal(relationOne.status,'active');assert.equal(relationTwo.status,'active');
  assert.notEqual(relationOne.id,relationTwo.id);

  writeFileSync(f.sourceFile,'authorized synthetic counterexample');
  await f.c.sync(f.d.id);const sourceEvent=(await f.invoke('research_context',{})).sourceEvents.at(-1);
  const j2=await f.invoke('publish_artifact',{artifactId:j1.artifactId,expectedVersion:1,requestId:'j2',reason:'Authorized counterexample limits the mechanism',content:{...judgment,summary:'The counterexample limits J1 to P1 only',unknowns:['Whether P2 remains conditionally usable']}});
  const review=await f.invoke('record_cognition_review',{requestId:'review-counterexample',judgment:{artifactId:j1.artifactId,version:1},resultJudgment:{artifactId:j2.artifactId,version:2},trigger:{kind:'source_event',eventId:sourceEvent.eventId,sourceId:sourceEvent.sourceId,observedAt:sourceEvent.observedAt},conclusion:'revised',summary:'The exact counterexample contradicts part of the mechanism',reason:'P1 and P2 must be reviewed separately; P3 is unrelated',changes:['The mechanism no longer supports P2 unconditionally'],limitations:['No causal business-effect claim'],unknowns:['P2 condition unknown'],nextReview:{condition:'Recheck after P1 and P2 exact re-evaluation'}});
  const duplicateReview=await f.invoke('record_cognition_review',{requestId:'review-counterexample-replayed',judgment:{artifactId:j1.artifactId,version:1},trigger:{kind:'source_event',eventId:sourceEvent.eventId,sourceId:sourceEvent.sourceId,observedAt:sourceEvent.observedAt},conclusion:'maintained',summary:'The same exact trigger must not add independent evidence',reason:'Duplicate exact trigger',changes:[],limitations:[],unknowns:[],nextReview:{condition:'No new review from the same trigger'}});
  assert.equal(duplicateReview.id,review.id);assert.equal(duplicateReview.reevaluations.length,2);
  assert.equal(review.conclusion,'revised');assert.deepEqual(review.resultJudgment,{artifactId:j2.artifactId,version:2});
  assert.equal(review.reevaluations.length,2);
  assert.ok(review.reevaluations.every(task=>task.status==='pending'));
  assert.ok(review.reevaluations.every(task=>task.plan.version===1));
  await f.invoke('arrange_followup',{requestId:'cognition-review-followup',artifact:{artifactId:j2.artifactId,version:2},reason:'Keep a quiet future observation while re-evaluations recover',dependencies:[],trigger:{kind:'at',at:new Date(Date.now()+600000).toISOString()}});
  const contextOne=await f.invoke('research_context',{});
  assert.equal(contextOne.cognition.pendingReevaluations.length,2);
  const stepGate=f.main().options.beforeStep;
  assert.equal(await stepGate(f.main().binding,{scheduledOnly:true}),true,'Pending re-evaluation must allow a native scheduled-only wake');

  const first=review.reevaluations.find(task=>task.plan.artifactId===p1.artifactId);
  const second=review.reevaluations.find(task=>task.plan.artifactId===p2.artifactId);
  const maintained=await f.invoke('record_plan_reassessment',{id:first.id,requestId:'review-p1',expectedRelationRevision:first.relation.revision,conclusion:'maintain',reason:'The counterexample does not affect the P1 premise',nextSteps:['Continue the existing observation'],unknowns:['Business effect remains unknown']});
  assert.equal(maintained.status,'completed');assert.equal(maintained.result.conclusion,'maintain');assert.equal(maintained.result.outcomePlan,undefined);
  const adjusted=await f.invoke('record_plan_reassessment',{id:second.id,requestId:'review-p2',expectedRelationRevision:second.relation.revision,conclusion:'limit',reason:'The applicability condition must be narrowed',nextSteps:['Publish a narrowed recommendation'],unknowns:['The exact new condition remains unknown']});
  assert.equal(adjusted.status,'completed');assert.equal(adjusted.result.conclusion,'limit');
  const repeated=await f.invoke('record_plan_reassessment',{id:first.id,requestId:'review-p1',expectedRelationRevision:first.relation.revision,conclusion:'maintain',reason:'The counterexample does not affect the P1 premise',nextSteps:['Continue the existing observation'],unknowns:['Business effect remains unknown']});
  assert.equal(repeated.id,maintained.id);
  const context=await f.invoke('research_context',{});
  assert.equal(context.cognition.pendingReevaluations.length,0);
  assert.equal(await f.main().options.beforeStep(f.main().binding,{scheduledOnly:true}),false,'No pending re-evaluation alone wakes a quiet main session');
  assert.equal(context.cognition.reviews.length,1);
  assert.equal(context.cognition.supportRelations.length,2);
  assert.equal(context.cognition.supportHistory.length,3);
  assert.ok(context.cognition.reevaluations.every(task=>task.plan.artifactId!==p3.artifactId));
  await f.invoke('publish_artifact',{artifactId:p1.artifactId,expectedVersion:1,requestId:'p1-v2',reason:'A later independent recommendation',content:artifact('P1 narrowed')});
  assert.equal(f.c.detail(f.d.id).operatorChoices.length,1);
  const finalDetail=f.c.detail(f.d.id);assert.equal(finalDetail.operatorChoices[0].artifact.version,1);assert.equal(finalDetail.outcomeFeed.executions[0].artifact.version,1);assert.equal(finalDetail.outcomeFeed.executions[0].id,execution.id);
 }finally{await f.close();}
});

test('a changed dependent plan cannot be closed by an old re-evaluation result',async()=>{
 const f=await boot();try{
  const plan=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'plan-v1',reason:'Synthetic dependent plan',content:artifact('Dependent plan')});
  const j1=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'judgment-v1',reason:'Initial support',content:judgment});
  const relation=await f.invoke('declare_support_dependency',{requestId:'support',judgment:{artifactId:j1.artifactId,version:1},plan:{artifactId:plan.artifactId,version:1},scope:'The whole declared scope',why:'The plan depends on the judgment mechanism',reason:'Agent declared the support after exact review'});
  writeFileSync(f.sourceFile,'later authorized counterexample');
  await f.c.sync(f.d.id);const sourceEvent=(await f.invoke('research_context',{})).sourceEvents.at(-1);
  const j2=await f.invoke('publish_artifact',{artifactId:j1.artifactId,expectedVersion:1,requestId:'judgment-v2',reason:'A material counterexample',content:{...judgment,summary:'The mechanism is limited'}});
  const review=await f.invoke('record_cognition_review',{requestId:'review',judgment:{artifactId:j1.artifactId,version:1},resultJudgment:{artifactId:j2.artifactId,version:2},trigger:{kind:'source_event',eventId:sourceEvent.eventId,sourceId:sourceEvent.sourceId,observedAt:sourceEvent.observedAt},conclusion:'limited',summary:'The mechanism changed',reason:'The dependent plan needs review',changes:['Applicability narrowed'],limitations:['Synthetic only'],unknowns:['New recommendation unknown'],nextReview:{condition:'After exact plan review'}});
  const task=review.reevaluations[0];
  await assert.rejects(f.invoke('record_plan_reassessment',{id:task.id,requestId:'stale-cas',expectedRelationRevision:task.relation.revision+1,conclusion:'withdraw',reason:'A stale caller must not close the responsibility',nextSteps:['None'],unknowns:[]}),error=>error.code==='cognition_conflict');
  assert.equal((await f.invoke('research_context',{})).cognition.pendingReevaluations.length,1);
  await f.invoke('publish_artifact',{artifactId:plan.artifactId,expectedVersion:1,requestId:'plan-v2',reason:'The recommendation changed independently',content:artifact('Dependent plan v2')});
  await assert.rejects(f.invoke('record_plan_reassessment',{id:task.id,requestId:'close-stale',expectedRelationRevision:relation.revision,conclusion:'withdraw',reason:'Old result',nextSteps:['None'],unknowns:[]}),error=>error.code==='cognition_target_changed');
  const context=await f.invoke('research_context',{});
  assert.equal(context.cognition.pendingReevaluations.length,0);
  assert.equal(context.cognition.reevaluations[0].status,'superseded');
 }finally{await f.close();}
});
