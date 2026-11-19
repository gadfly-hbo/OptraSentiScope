import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
import {LifecycleControlsStore} from '../src/lifecycle-controls.ts';

async function boot(){
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'lifecycle-enterprise',principalId:'operator'},opened=[],schedules=[];
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-lifecycle-')),fact=join(directory,'fact.txt');writeFileSync(fact,'first');
 const native={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){const row={id:`schedule-${schedules.length}`,status:'active',target:{kind:'session',sessionId:options.sessionId},...request};schedules.push(row);return row;},async disableSchedule(id){const row=schedules.find(item=>item.id===id);if(row)row.status='paused';},async listSchedules(){return schedules;}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5,6,7]}}),delegation=store.create(owner,{goal:'Synthetic lifecycle controls',idempotencyKey:'create'});await coordinator.sync(delegation.id);coordinator.configureSources(delegation.id,[{sourceId:'source',directory,grantRevision:1,enabled:true}]);await coordinator.sync(delegation.id);
 return{store,owner,coordinator,delegation,directory,fact,opened,schedules,async close(){await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}

test('research can pause while authorized collection continues and a scoped direction resumes independently',async()=>{
 const f=await boot();try{
  const before=f.coordinator.detail(f.delegation.id);
  const paused=await f.coordinator.pauseResearch(f.delegation.id,{expectedRevision:0,mode:'direction',scope:'P1',reason:'Only P1 waits for operator input',idempotencyKey:'pause-p1'});
  assert.deepEqual([...paused.pausedScopes],['P1']);assert.equal(paused.researchPaused,true);assert.equal(paused.collectionPaused,false);
  const replay=await f.coordinator.pauseResearch(f.delegation.id,{expectedRevision:0,mode:'direction',scope:'P1',reason:'Only P1 waits for operator input',idempotencyKey:'pause-p1'});assert.deepEqual(replay,paused);
  writeFileSync(f.fact,'second');await f.coordinator.sync(f.delegation.id);
  const detail=f.coordinator.detail(f.delegation.id);assert.ok(detail.sources.some(source=>source.status==='ready'));assert.ok(detail.sourceReferences.length>=1);assert.equal(detail.research.length,before.research.length,'paused research direction must not add a research ticket');assert.equal(detail.artifactRevisions.length,before.artifactRevisions.length,'paused research direction must not publish research output');
  const independent=await f.coordinator.pauseResearch(f.delegation.id,{expectedRevision:paused.revision,mode:'direction',scope:'P2',reason:'Independent P2 also waits',idempotencyKey:'pause-p2'});assert.deepEqual([...independent.pausedScopes],['P1','P2']);
  const oldPauseReplay=await f.coordinator.pauseResearch(f.delegation.id,{expectedRevision:0,mode:'direction',scope:'P1',reason:'Only P1 waits for operator input',idempotencyKey:'pause-p1'});assert.deepEqual(oldPauseReplay,paused);
  const resumed=await f.coordinator.resumeResearch(f.delegation.id,{expectedRevision:independent.revision,scope:'P1',reason:'P1 input is available',idempotencyKey:'resume-p1'});assert.deepEqual([...resumed.pausedScopes],['P2']);assert.equal(resumed.researchPaused,true);
  const allResumed=await f.coordinator.resumeResearch(f.delegation.id,{expectedRevision:resumed.revision,scope:'P2',reason:'P2 can continue',idempotencyKey:'resume-p2'});assert.deepEqual([...allResumed.pausedScopes],[]);assert.equal(allResumed.researchPaused,false);
  const settledPauseReplay=await f.coordinator.pauseResearch(f.delegation.id,{expectedRevision:0,mode:'direction',scope:'P1',reason:'Only P1 waits for operator input',idempotencyKey:'pause-p1'});assert.deepEqual(settledPauseReplay,paused);
 }finally{await f.close();}
});

test('lifecycle control request replay keeps its original receipt across later revisions and store reopen',()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-lifecycle-replay-')),filename=join(directory,'business.sqlite'),owner={enterpriseId:'lifecycle-replay-enterprise',principalId:'operator'};
 let store=new SentiStore({filename:filename});try{
  const delegation=store.create(owner,{goal:'Synthetic replay receipt',idempotencyKey:'create'}),now='2026-11-19T08:00:00.000Z';
  let controls=new LifecycleControlsStore(store,{owner,delegationId:delegation.id},()=>now);
  const pause=controls.pauseResearch({expectedRevision:0,mode:'all',reason:'Wait for input',idempotencyKey:'pause'});
  const resume=controls.resumeResearch({expectedRevision:1,reason:'Input arrived',idempotencyKey:'resume'});
  assert.deepEqual(controls.pauseResearch({expectedRevision:0,mode:'all',reason:'Wait for input',idempotencyKey:'pause'}),pause);
  store.close();store=new SentiStore({filename:filename});
  controls=new LifecycleControlsStore(store,{owner,delegationId:delegation.id},()=>'2026-11-19T09:00:00.000Z');
  assert.deepEqual(controls.pauseResearch({expectedRevision:0,mode:'all',reason:'Wait for input',idempotencyKey:'pause'}),pause);
  assert.equal(controls.status().revision,resume.revision);
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});

test('scheduled resume and end use one persisted native lifecycle schedule intent each',async()=>{
 const f=await boot();try{
  const at=new Date(Date.now()+60000).toISOString();
  const resume=await f.coordinator.scheduleResume(f.delegation.id,{expectedRevision:0,at,reason:'Operator promised a return time',idempotencyKey:'resume-plan'});
  assert.equal(resume.kind,'resume');assert.equal(resume.schedule.status,'active');assert.ok(resume.schedule.id);
  const replay=await f.coordinator.scheduleResume(f.delegation.id,{expectedRevision:0,at,reason:'Operator promised a return time',idempotencyKey:'resume-plan'});assert.deepEqual(replay,resume);
  const endAt=new Date(Date.now()+120000).toISOString();
  const end=await f.coordinator.scheduleEnd(f.delegation.id,{expectedRevision:0,at:endAt,reason:'Fixed validity expires',idempotencyKey:'end-plan'});
  assert.equal(end.kind,'end');assert.notEqual(end.schedule.id,resume.schedule.id);assert.equal(f.schedules.filter(item=>item.title==='委托约定生命周期').length,2);
 }finally{await f.close();}
});

test('due lifecycle plans resume research and end the delegation with matching durable receipts',async()=>{
 const f=await boot();try{
  const paused=await f.coordinator.pauseResearch(f.delegation.id,{expectedRevision:0,mode:'all',reason:'Wait for promised input',idempotencyKey:'pause-all'});
  const resumeAt=new Date(Date.now()+1100).toISOString();
  await f.coordinator.scheduleResume(f.delegation.id,{expectedRevision:0,at:resumeAt,reason:'Promised resume',idempotencyKey:'due-resume'});
  await new Promise(resolve=>setTimeout(resolve,1200));await f.coordinator.sync(f.delegation.id);
  const resumed=f.store.get(f.owner,f.delegation.id);assert.equal(resumed.lifecycle,'active');assert.equal(JSON.stringify(f.coordinator.detail(f.delegation.id).technical.filter(item=>item.kind==='lifecycle_resume_due').length>0),String(true));
  const endAt=new Date(Date.now()+1100).toISOString();
  await f.coordinator.scheduleEnd(f.delegation.id,{expectedRevision:0,at:endAt,reason:'Validity expires',idempotencyKey:'due-end'});
  await new Promise(resolve=>setTimeout(resolve,1200));await f.coordinator.sync(f.delegation.id);
  const ended=f.store.get(f.owner,f.delegation.id),endedDetail=f.coordinator.detail(f.delegation.id);assert.equal(ended.lifecycle,'ended');assert.ok(endedDetail.technical.some(item=>item.kind==='lifecycle_end_due'));
 }finally{await f.close();}
});
