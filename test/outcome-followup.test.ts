import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {FollowupStore} from '../src/followup.ts';
import type {FollowupPlan} from '../src/followup.ts';
import type {RunBinding} from '../runtime/index.ts';

test('an exact outcome can retain its original plan review after a newer plan replaces the recommendation',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'outcome-followup-fixture',principalId:'operator'},d=store.create(owner,{goal:'Synthetic outcome followup',idempotencyKey:'create'});
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main'};
 let now='2026-11-17T00:00:00.000Z';
 const outcome={kind:'execution' as const,id:'execution-original',revision:1},artifact={artifactId:'original-plan',version:1};
 const followups=new FollowupStore(store,{owner,delegationId:d.id},{isCurrent:()=>true,isArtifactCurrent:()=>false,isOutcomeCurrent:(_binding:RunBinding,ref:{kind:"execution"|"observation";id:string;revision:number},plan:typeof artifact)=>ref.id===outcome.id&&ref.revision===1&&plan.artifactId===artifact.artifactId&&plan.version===1,now:()=>now});
 try{
  const plan={requestId:'review-original',artifact,outcome,reason:'Actual execution still belongs to the selected original plan',dependencies:['Wait for authorized operating evidence'],trigger:{kind:'at' as const,at:'2026-11-17T00:01:00.000Z'}};
  const saved=followups.plan(binding,plan as FollowupPlan);
  assert.deepEqual((saved as typeof saved&{outcome:typeof outcome}).outcome,outcome);
  assert.equal(followups.listCurrent(binding).length,1);
  followups.prepareSchedule(binding,saved.id,'main-session');followups.attachSchedule(binding,saved.id,{sessionId:'main-session',scheduleId:'native-at-original'});
  now='2026-11-17T00:01:00.000Z';assert.equal(followups.eligibleDue(binding)[0]?.id,saved.id);
  assert.equal(followups.observe(binding,saved.id,{requestId:'checked',summary:'Checked exact execution; no business result is inferred'}).status,'observed');
  assert.throws(()=>followups.plan(binding,{...plan,requestId:'ordinary-latest-rule',outcome:undefined} as FollowupPlan),{code:'followup_artifact_stale'});
 }finally{store.close();}
});

test('a superseded execution revision cannot be completed as the current result review without reconciliation',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'outcome-superseded-fixture',principalId:'operator'},d=store.create(owner,{goal:'Synthetic exact review',idempotencyKey:'create'});
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main'};let revision=1,now='2026-11-17T00:00:00.000Z';
 const f=new FollowupStore(store,{owner,delegationId:d.id},{isCurrent:()=>true,isArtifactCurrent:()=>true,isOutcomeCurrent:(_b,r)=>r.revision===revision,now:()=>now});
 try{
  const record=f.plan(binding,{requestId:'exact-review',artifact:{artifactId:'original',version:1},outcome:{kind:'execution',id:'execution',revision:1},reason:'Review the exact latest execution snapshot',dependencies:[],trigger:{kind:'at',at:'2026-11-17T00:01:00.000Z'}});
  now='2026-11-17T00:02:00.000Z';assert.equal(f.eligibleDue(binding)[0].id,record.id);revision=2;
  assert.throws(()=>f.observe(binding,record.id,{requestId:'stale-check',summary:'Must not count as current responsibility'}),{code:'followup_ineligible'});
  assert.equal(f.get(record.id)?.observation,undefined);assert.equal(f.reconcile(binding)[0].status,'superseded');
 }finally{store.close();}
});

test('pausing during native result-review creation retains the responsibility after a late ID is stopped',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'outcome-pause-fixture',principalId:'operator'},d=store.create(owner,{goal:'Synthetic pause during creation',idempotencyKey:'create'});
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main'};
 const f=new FollowupStore(store,{owner,delegationId:d.id},{isCurrent:()=>true,isArtifactCurrent:()=>false,isOutcomeCurrent:()=>true,now:()=> '2026-11-17T00:00:00.000Z'});
 try{
  const record=f.plan(binding,{requestId:'pause-review',artifact:{artifactId:'original',version:1},outcome:{kind:'execution',id:'execution',revision:1},reason:'Future actual result remains to be checked',dependencies:[],trigger:{kind:'at',at:'2026-11-17T00:10:00.000Z'}});
  f.prepareSchedule(binding,record.id,'old-session');
  const pausing=store.requestLifecycle(owner,d.id,{expectedVersion:1,action:'pause',idempotencyKey:'pause'});f.pause();
  const late=f.attachSchedule(binding,record.id,{sessionId:'old-session',scheduleId:'late-native-id'});
  assert.equal(late.schedule.status,'stop_pending');assert.equal(late.status,'waiting');
  f.scheduleStopped(record.id);
  assert.ok(pausing.pendingOperation);
  const paused=store.completeLifecycle(owner,d.id,{operationId:pausing.pendingOperation.id,expectedVersion:pausing.version,outcome:'stopped',evidence:'Exact late native ID stopped'});
  const resuming=store.requestLifecycle(owner,d.id,{expectedVersion:paused.version,action:'resume',idempotencyKey:'resume'});
  assert.ok(resuming.pendingOperation);
  store.completeLifecycle(owner,d.id,{operationId:resuming.pendingOperation.id,expectedVersion:resuming.version,outcome:'eligible',evidence:'Current permissions rechecked'});
  const rebound=f.prepareSchedule({...binding,generation:2},record.id,'new-session');assert.equal(rebound.status,'waiting');assert.equal(rebound.previousSchedules?.[0].id,'late-native-id');
 }finally{store.close();}
});
