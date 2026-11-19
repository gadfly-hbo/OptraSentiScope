import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

async function boot(){
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'cognition-p1-runtime',principalId:'operator'},opened=[];
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-cognition-p1-')),factFile=join(directory,'fact.txt');writeFileSync(factFile,'original synthetic mechanism fact');
 const native={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${Math.random()}`,status:'active',...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'},notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5,6,7]}}),delegation=store.create(owner,{goal:'Synthetic P1 cognition gap',idempotencyKey:'create'});await coordinator.sync(delegation.id);coordinator.configureSources(delegation.id,[{sourceId:'source',directory,grantRevision:1,enabled:true}]);await coordinator.sync(delegation.id);
 const main=()=>opened.findLast(entry=>entry.binding.role==='main');const invoke=(name,args)=>{const tool=main().options.tools.find(item=>item.name===name);assert.ok(tool,`Missing ${name}`);return tool.execute(args,{signal:new AbortController().signal});};
 return{store,owner,coordinator,delegation,directory,factFile,main,invoke,async close(){await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}
const artifactContent=(title,summary)=>({kind:'plan',title,summary,evidence:[],assumptions:[],unknowns:['Operating effect unknown'],applicability:'Only synthetic P1 scope',invalidatedBy:['Counterexample'],recommendation:'Use only the bounded scope',alternatives:[{option:'Wait',costs:'Unknown',risks:'Unknown'}],constraints:['No operating action'],observation:{baseline:'Synthetic',expectedChange:'Unknown',measure:'Synthetic',window:'Later',source:'Synthetic',check:'Recheck'}});

test('the Agent reads an exact cross-epoch original and records a legal same-item plan adjustment',async()=>{
 const f=await boot();try{
  const plan=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'plan-v1',reason:'Initial plan',content:artifactContent('P1','Original recommendation')});
  const judgment=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'judgment-v1',reason:'Initial support',content:{kind:'judgment',title:'J1',summary:'Original mechanism support',evidence:[],assumptions:[],unknowns:[],applicability:'Synthetic P1',invalidatedBy:['Counterexample']}});
  const originalEpoch=f.main().binding.epoch;
  const relation=await f.invoke('declare_support_dependency',{requestId:'support',judgment:{artifactId:judgment.artifactId,version:1},plan:{artifactId:plan.artifactId,version:1},scope:'Only synthetic P1 scope',why:'P1 depends on J1',reason:'Agent declared direct support'});
  const relationReplay=await f.invoke('declare_support_dependency',{requestId:'support',judgment:{artifactId:judgment.artifactId,version:1},plan:{artifactId:plan.artifactId,version:1},scope:'Only synthetic P1 scope',why:'P1 depends on J1',reason:'Agent declared direct support'});assert.deepEqual(relationReplay,relation);
  writeFileSync(join(f.directory,'counterexample.txt'),'synthetic counterexample');
  await f.coordinator.sync(f.delegation.id);const sourceEvent=(await f.invoke('research_context',{})).sourceEvents.find(event=>event.sourceId==='source'&&event.eventId!=='source-grant-configured');
  assert.ok(sourceEvent);assert.ok(f.main().binding.epoch>1,'source update must advance qualification');
  const original=await f.invoke('read_artifact',{artifactId:judgment.artifactId,version:1});assert.equal(original.content.summary,'Original mechanism support');assert.equal(original.epoch,originalEpoch);
  const review=await f.invoke('record_cognition_review',{requestId:'review',judgment:{artifactId:judgment.artifactId,version:1},trigger:{kind:'source_event',eventId:sourceEvent.eventId,sourceId:sourceEvent.sourceId,observedAt:sourceEvent.observedAt},conclusion:'limited',summary:'The counterexample limits support',reason:'P1 must be adjusted',changes:['Support narrowed'],limitations:['Synthetic only'],unknowns:[],nextReview:{condition:'After adjustment'}});
  const task=review.reevaluations[0];const planV2=await f.invoke('publish_artifact',{artifactId:plan.artifactId,expectedVersion:1,requestId:'plan-v2',reason:'Adjust the same recommendation item',content:artifactContent('P1 adjusted','Adjusted recommendation')});
  const adjusted=await f.invoke('record_plan_reassessment',{id:task.id,requestId:'adjust',expectedRelationRevision:task.relation.revision,conclusion:'adjust',reason:'The adjusted version preserves the same business item with a narrower scope',nextSteps:['Continue observation'],unknowns:[],outcomePlan:{artifactId:planV2.artifactId,version:planV2.version}});
  assert.equal(adjusted.status,'completed');assert.deepEqual(adjusted.result.outcomePlan,{artifactId:plan.artifactId,version:2});
  const context=await f.invoke('research_context',{});assert.equal(context.cognition.pendingReevaluations.length,0);assert.equal(context.cognition.supportRelations[0].plan.version,2);
  const repeated=await f.invoke('record_plan_reassessment',{id:task.id,requestId:'adjust',expectedRelationRevision:task.relation.revision,conclusion:'adjust',reason:'The adjusted version preserves the same business item with a narrower scope',nextSteps:['Continue observation'],unknowns:[],outcomePlan:{artifactId:planV2.artifactId,version:planV2.version}});assert.deepEqual(repeated,adjusted);
 }finally{await f.close();}
});
