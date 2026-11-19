import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

async function boot(){
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'experience-synthetic-enterprise',principalId:'operator'},opened=[];
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-experiences-')),factFile=join(directory,'fact.txt');writeFileSync(factFile,'synthetic experience source v1');
 const native={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${Math.random()}`,status:'active',...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'},notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5,6,7]}}),first=store.create(owner,{goal:'Synthetic experience origin',idempotencyKey:'first'}),second=store.create(owner,{goal:'Synthetic experience consumer',idempotencyKey:'second'});await coordinator.sync(first.id);await coordinator.sync(second.id);
 const grant={sourceId:'shared-source',directory,grantRevision:1,enabled:true};coordinator.configureSources(first.id,[grant]);coordinator.configureSources(second.id,[grant]);await coordinator.sync(first.id);await coordinator.sync(second.id);
 const run=id=>opened.findLast(entry=>entry.binding.delegationId===id);const invoke=(id,name,args)=>{const tool=run(id).options.tools.find(item=>item.name===name);assert.ok(tool,`Missing ${name}`);return tool.execute(args,{signal:new AbortController().signal});};
 return{store,owner,coordinator,first,second,directory,factFile,invoke,async close(){await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}
const judgmentContent=(title,evidence)=>({kind:'judgment',title,summary:`${title}: bounded synthetic support`,evidence:[evidence],assumptions:[],unknowns:['Business quality unknown'],applicability:'Only synthetic experience scope',invalidatedBy:['Counterexample']});
const planContent=(title,evidence)=>({kind:'plan',title,summary:`${title}: bounded synthetic recommendation`,evidence:[evidence],assumptions:[],unknowns:['Operating effect unknown'],applicability:'Only synthetic experience scope',invalidatedBy:['Counterexample'],recommendation:'Use the bounded synthetic approach',alternatives:[{option:'Wait',costs:'Unknown',risks:'Unknown'}],constraints:['No operating action'],observation:{baseline:'Synthetic',expectedChange:'Unknown',measure:'Synthetic',window:'Later',source:'Shared synthetic source',check:'Recheck'}});

test('two same-enterprise delegations form, discover, apply, revise, and reassess from an exact experience',async()=>{
 const f=await boot();try{
  const grant={sourceId:'shared-source',directory:f.directory,grantRevision:1,enabled:true};
  const source=(await f.invoke(f.first.id,'research_context',{})).references.at(-1);assert.ok(source);
  const origin=await f.invoke(f.first.id,'publish_artifact',{expectedVersion:0,requestId:'origin-judgment',reason:'Origin judgment',content:judgmentContent('J1',{ref:source.ref,hash:source.hash})});
  const experience=await f.invoke(f.first.id,'publish_experience',{requestId:'experience-v1',title:'Conditional synthetic experience',summary:'Use the mechanism only in the declared synthetic condition',evidence:[{ref:source.ref,hash:source.hash}],basis:[{kind:'judgment',artifact:{artifactId:origin.artifactId,version:1}}],businessConditions:['Only the declared synthetic scope'],validUntil:'2099-01-01T00:00:00.000Z',limitations:['No business-effect proof'],counterexamples:[],unknowns:['Long-run stability unknown'],revalidateWhen:{condition:'A new authorized counterexample arrives'},status:'active',reason:'Origin Agent reviewed exact judgment/source'});
  assert.equal(experience.version,1);assert.equal(experience.sourceDelegationId,f.first.id);

  const discovered=await f.invoke(f.second.id,'find_experiences',{});assert.equal(discovered.experiences.length,1);assert.equal(discovered.experiences[0].qualification,'current');
  const read=await f.invoke(f.second.id,'read_experience',{id:experience.id,version:1});assert.equal(read.summary,'Use the mechanism only in the declared synthetic condition');
  const targetSource=(await f.invoke(f.second.id,'research_context',{})).references.find(item=>item.hash===source.hash);assert.ok(targetSource);const informed=await f.invoke(f.second.id,'publish_artifact',{expectedVersion:0,requestId:'informed-judgment',reason:'Applicable experience shaped this verification direction',content:{...judgmentContent('J2',{ref:targetSource.ref,hash:targetSource.hash}),summary:'Experience narrowed the verification direction before judging'}});
  const used=await f.invoke(f.second.id,'record_experience_use',{requestId:'experience-use',experience:{id:experience.id,version:1},decision:'applied',reason:'The target scope matches the declared business condition',influence:'Prioritized the mechanism precondition and excluded an unrelated path',artifact:{artifactId:informed.artifactId,version:1}});
  assert.equal(used.decision,'applied');assert.deepEqual(used.artifact,{artifactId:informed.artifactId,version:1});
  const rejected=await f.invoke(f.second.id,'record_experience_use',{requestId:'experience-reject',experience:{id:experience.id,version:1},decision:'not_applied',reason:'An unrelated target does not match the declared condition',influence:'Avoided importing the mechanism'});assert.equal(rejected.decision,'not_applied');

  f.coordinator.configureSources(f.first.id,[]);await f.coordinator.sync(f.first.id);
  const unavailable=await f.invoke(f.second.id,'find_experiences',{});assert.equal(unavailable.experiences[0].qualification,'unavailable');
  await assert.rejects(f.invoke(f.second.id,'read_experience',{id:experience.id,version:1}),{code:'experience_source_unavailable'});
  const shielded=f.coordinator.detail(f.second.id);assert.equal(JSON.stringify(shielded.experiences).includes('Use the mechanism only in the declared synthetic condition'),false);
  f.coordinator.configureSources(f.first.id,[{...grant,grantRevision:3}]);await f.coordinator.sync(f.first.id);

  writeFileSync(join(f.directory,'counterexample.txt'),'synthetic counterexample');await f.coordinator.sync(f.second.id);await f.coordinator.sync(f.first.id);const counter=(await f.invoke(f.first.id,'research_context',{})).references.find(item=>item.hash!==source.hash);assert.ok(counter);
  const revised=await f.invoke(f.first.id,'publish_experience',{id:experience.id,expectedVersion:1,requestId:'experience-v2',title:'Conditional synthetic experience',summary:'The mechanism is limited after the counterexample',evidence:[{ref:source.ref,hash:source.hash},{ref:counter.ref,hash:counter.hash}],basis:[{kind:'judgment',artifact:{artifactId:origin.artifactId,version:1}}],businessConditions:['Only the unaffected subset'],validUntil:'2099-01-01T00:00:00.000Z',limitations:['No business-effect proof','Counterexample excludes the original broad scope'],counterexamples:[{ref:counter.ref,hash:counter.hash}],unknowns:['Exact unaffected boundary unknown'],revalidateWhen:{condition:'After dependent recommendations are reassessed'},status:'limited',reason:'New authorized counterexample limits applicability'});
  assert.equal(revised.version,2);assert.equal(revised.status,'limited');

  const plan=await f.invoke(f.first.id,'publish_artifact',{expectedVersion:0,requestId:'dependent-plan',reason:'Dependent recommendation',content:planContent('P1',{ref:source.ref,hash:source.hash})});
  await f.invoke(f.first.id,'declare_support_dependency',{requestId:'support',judgment:{artifactId:origin.artifactId,version:1},plan:{artifactId:plan.artifactId,version:1},scope:'Only the declared synthetic scope',why:'P1 depends on J1',reason:'Agent declared direct support'});
  const review=await f.invoke(f.first.id,'record_cognition_review',{requestId:'experience-review',judgment:{artifactId:origin.artifactId,version:1},trigger:{kind:'experience',id:experience.id,version:2},conclusion:'limited',summary:'The experience counterexample limits J1',reason:'Only the dependent recommendation needs reassessment',changes:['J1 applicability narrowed'],limitations:['Synthetic only'],unknowns:[],nextReview:{condition:'After P1 reassessment'}});
  assert.equal(review.reevaluations.length,1);assert.deepEqual(review.reevaluations[0].plan,{artifactId:plan.artifactId,version:1});
  const completed=await f.invoke(f.first.id,'record_plan_reassessment',{id:review.reevaluations[0].id,requestId:'plan-reassessment',expectedRelationRevision:review.reevaluations[0].relation.revision,conclusion:'limit',reason:'The experience counterexample narrows P1',nextSteps:['Publish a narrowed recommendation'],unknowns:['Exact boundary unknown']});assert.equal(completed.status,'completed');

  const expired=await f.invoke(f.first.id,'publish_experience',{requestId:'expired-experience',title:'Expired synthetic experience',summary:'This condition is no longer valid',evidence:[{ref:source.ref,hash:source.hash}],basis:[{kind:'judgment',artifact:{artifactId:origin.artifactId,version:1}}],businessConditions:['Expired condition'],validUntil:'2020-01-01T00:00:00.000Z',limitations:[],counterexamples:[],unknowns:[],revalidateWhen:{condition:'Never without new evidence'},status:'active',reason:'Test expiry boundary'});
  const expiredMeta=(await f.invoke(f.second.id,'find_experiences',{})).experiences.find(item=>item.id===expired.id);assert.equal(expiredMeta.qualification,'expired');
  await assert.rejects(f.invoke(f.second.id,'record_experience_use',{requestId:'expired-use',experience:{id:expired.id,version:1},decision:'applied',reason:'Expired',influence:'Must not apply'}),{code:'experience_not_applicable'});
  const repeatRead=await f.invoke(f.second.id,'read_experience',{id:experience.id,version:2});const repeatFind=(await f.invoke(f.second.id,'find_experiences',{})).experiences.find(item=>item.id===experience.id);assert.equal(repeatRead.version,2);assert.equal(repeatFind.version,2);assert.equal((await f.invoke(f.second.id,'find_experiences',{})).experiences.length,2);

  const foreignOwner={enterpriseId:'experience-other-enterprise',principalId:'operator'},foreignOpened=[];
  const foreignNative={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`foreign-${Math.random()}`,...request};},async disableSchedule(){},async listSchedules(){return[];}};foreignOpened.push({binding,options,handle});return handle;},async dispose(){}};
  const foreignCoordinator=new ResearchCoordinator({store:f.store,owner:foreignOwner,native:foreignNative,Engine,model:{provider:'local-fixture',model:'synthetic'},notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5,6,7]}});
  try{
   const foreign=await (async()=>{const created=f.store.create(foreignOwner,{goal:'Foreign enterprise isolation',idempotencyKey:'foreign'});await foreignCoordinator.sync(created.id);foreignCoordinator.configureSources(created.id,[{sourceId:'shared-source',directory:f.directory,grantRevision:1,enabled:true}]);await foreignCoordinator.sync(created.id);return created;})();
   const foreignRun=()=>foreignOpened.findLast(entry=>entry.binding.delegationId===foreign.id);const foreignTool=foreignRun().options.tools.find(item=>item.name==='find_experiences');
   const isolated=await foreignTool.execute({},{signal:new AbortController().signal});assert.equal(isolated.experiences.length,0);
  }finally{await foreignCoordinator.close();}
 }finally{await f.close();}
});
