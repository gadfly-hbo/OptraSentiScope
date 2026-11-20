import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {Engine} from 'dsh-superagent';
import {ResearchCoordinator} from '../src/research.ts';
import {SentiStore} from '../src/store.ts';

const cases=[
 {name:'a due end stays blocked with the same operation until cold cleanup of its exact timer succeeds'},
 {name:'a legacy prematurely completed end is recovered before research resumes',legacy:true},
 {name:'an unprovable timer identity keeps the end UNKNOWN even when known native resources stop',unprovenIdentity:true},
 {name:'an acknowledged end stays UNKNOWN if a different native lifecycle timer has no creation receipt',unknownTimer:true},
 {name:'a due agreed end settles a paused delegation on cold reopen without reviving research',pausedBeforeExpiry:true},
];
for(const {name,legacy,unprovenIdentity,unknownTimer,pausedBeforeExpiry}of cases)test(name,async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-lifecycle-end-'));
 const filename=join(directory,'business.sqlite');
 const owner={enterpriseId:'scheduled-end-fixture',principalId:'operator'};
 let store=new SentiStore({filename});
 let coordinator;
 let rejectStop=true;
 let loseNextTimerReceipt=false;
 let assignedPlan;
 const opens=[],deliveries=[],stopAttempts=[],schedules=new Map();
 const native={
  async open(binding,options){
   opens.push({binding,options});
   const sessionId=options.sessionId;
   const known=new Set(options.scheduleIds);
   return {
    binding,sessionId,configured:Boolean(options.model),
    async deliver(message){deliveries.push(message);return {accepted:true,messageId:message.id};},
    cancel(){},async whenIdle(){},async dispose(){},
    async createSchedule(request){
     const row={...request,id:`timer-${schedules.size}`,target:{kind:'session',sessionId},status:'active'};
     schedules.set(row.id,row);known.add(row.id);
     if(loseNextTimerReceipt)throw new Error('Synthetic timer created with no receipt');
     return row;
    },
    async disableSchedule(id){
     const row=schedules.get(id);
     assert.ok(known.has(id));assert.equal(row?.target.sessionId,sessionId);
     if(id===assignedPlan?.schedule.id){
      // Read the independent connection at the native side-effect boundary.
      const reader=new SentiStore({filename});
      try{stopAttempts.push({sessionId,id,delegation:reader.get(owner,binding.delegationId)});}
      finally{reader.close();}
      if(rejectStop)throw new Error('Synthetic exact schedule stop failed');
     }
     row.status='paused';
    },
   };
  },
  async dispose(){},
 };
 const openCoordinator=()=>new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'}});
 try{
  coordinator=openCoordinator();
  const {id}=store.create(owner,{goal:'Synthetic agreed validity',idempotencyKey:'create'});
  await coordinator.sync(id);
  const at=new Date(Date.now()+500).toISOString();
  assignedPlan=await coordinator.scheduleEnd(id,{expectedRevision:0,at,reason:'Agreed validity ends',idempotencyKey:'schedule-end'});
  if(pausedBeforeExpiry){
   rejectStop=false;
   const requested=store.requestLifecycle(owner,id,{expectedVersion:store.get(owner,id).version,action:'pause',idempotencyKey:'whole-pause'});
   const operation=requested.pendingOperation;
   const receipt=await coordinator.controlPort.settle({owner,delegation:requested,operation,isCurrent:()=>true});
   store.completeLifecycle(owner,id,{operationId:operation.id,expectedVersion:operation.requestedVersion,...receipt});
   await coordinator.close();store.close();
   await sleep(Math.max(0,Date.parse(at)-Date.now())+10);
   store=new SentiStore({filename});coordinator=openCoordinator();
   assert.equal(store.get(owner,id).lifecycle,'paused');
   const nativeOpens=opens.length;
   await coordinator.start();
   assert.equal(store.get(owner,id).lifecycle,'ended');
   assert.equal(coordinator.detail(id).lifecycleControls.plans[0].status,'completed');
   assert.equal(opens.length,nativeOpens);
   return;
  }
  if(unknownTimer){
   loseNextTimerReceipt=true;
   await assert.rejects(coordinator.scheduleResume(id,{expectedRevision:0,at:new Date(Date.now()+60000).toISOString(),reason:'A separate agreed review',idempotencyKey:'schedule-resume'}),{code:'lifecycle_schedule_unknown'});
   loseNextTimerReceipt=false;
   assert.equal(coordinator.detail(id).lifecycleControls.plans[1].status,'unknown');
  }
  if(legacy||unprovenIdentity){
   const previous=structuredClone(assignedPlan);
   if(legacy){previous.status='completed';previous.schedule.status='stop_pending';}
   if(unprovenIdentity)previous.schedule.sessionId='another-session';
   store.connection.prepare('UPDATE lifecycle_schedule_plans SET value=? WHERE delegation_id=? AND id=?').run(JSON.stringify(previous),id,previous.id);
  }
  const initialCounts={opens:opens.length,deliveries:deliveries.length,schedules:schedules.size};
  await sleep(Math.max(0,Date.parse(at)-Date.now())+10);
  const currentMain=opens.at(-1);
  assert.equal(store.get(owner,id).lifecycle,'active','the due callback has not reconciled yet');
  for(const phase of ['open','deliver','step','tool'])assert.equal(currentMain.options.admit(currentMain.binding,phase),false,'the deadline fences ordinary native work before reconciliation');
  if(!unknownTimer)assert.equal(currentMain.options.admit(currentMain.binding,'schedule'),true,'the official resolver can still notify the Host');
  const [firstSync]=await Promise.allSettled([coordinator.sync(id)]);
  assert.equal(stopAttempts.length,1);
  const atFirstStop=stopAttempts[0].delegation;
  assert.equal(atFirstStop.lifecycle,'ending','the agreed end must commit before native timer cleanup');
  assert.equal(atFirstStop.pendingOperation.action,'end');
  const unknown=store.get(owner,id);
  assert.equal(unknown.lifecycle,'ending');
  assert.equal(unknown.pendingOperation.id,atFirstStop.pendingOperation.id);
  assert.equal(unknown.pendingOperation.outcome,'unknown');
  assert.equal(coordinator.detail(id).lifecycleControls.plans[0].status,'ending');
  assert.equal(firstSync.status,'fulfilled','a quarantined end must not prevent the Host from starting');

  await coordinator.close();store.close();
  store=new SentiStore({filename});coordinator=openCoordinator();
  assert.equal(store.get(owner,id).pendingOperation.id,atFirstStop.pendingOperation.id);
  await coordinator.start();
  assert.equal(store.get(owner,id).pendingOperation.outcome,'unknown');
  assert.equal(store.get(owner,id).version,unknown.version,'the same failed receipt must be idempotent');
  rejectStop=false;
  await coordinator.sync(id);
  const settled=store.get(owner,id);
  const detail=coordinator.detail(id);
  if(unprovenIdentity||unknownTimer){
   assert.equal(settled.lifecycle,'ending');assert.equal(settled.pendingOperation.outcome,'unknown');
   assert.equal(detail.lifecycleControls.plans[0].status,'ending');
   assert.equal(detail.lifecycleControls.plans[0].schedule.status,'stop_pending');
   assert.equal(detail.technical.filter(item=>item.kind==='lifecycle_end_due').length,0);
   if(unknownTimer)assert.equal(detail.lifecycleControls.plans[1].status,'unknown');
  }else{
   assert.equal(settled.lifecycle,'ended');assert.equal(settled.pendingOperation,null);
   assert.equal(detail.lifecycleControls.plans[0].status,'completed');
   assert.equal(detail.lifecycleControls.plans[0].schedule.status,'stopped');
   assert.equal(detail.technical.filter(item=>item.kind==='lifecycle_end_due').length,1);
  }
  assert.equal(stopAttempts.length,3);
  for(const attempt of stopAttempts){
   assert.equal(attempt.id,assignedPlan.schedule.id);assert.equal(attempt.sessionId,assignedPlan.schedule.sessionId);
   assert.equal(attempt.delegation.pendingOperation.id,atFirstStop.pendingOperation.id);
   assert.equal(attempt.delegation.pendingOperation.requestedVersion,atFirstStop.pendingOperation.requestedVersion);
  }
  for(const {binding,options} of opens.slice(initialCounts.opens)){
   assert.equal(options.sessionId,assignedPlan.schedule.sessionId);assert.equal(options.resume,true);
   assert.equal(options.model,undefined);assert.deepEqual(options.tools,[]);
   assert.equal(options.admit(binding,'open'),true);
   for(const phase of ['deliver','step','tool','schedule'])assert.equal(options.admit(binding,phase),false);
  }
  const reopenedCount=opens.length;
  await coordinator.sync(id);
  if(!unknownTimer)assert.equal(opens.length,reopenedCount);
  assert.equal(deliveries.length,initialCounts.deliveries);
  assert.equal(schedules.size,initialCounts.schedules);
 }finally{
  rejectStop=false;
  try{await coordinator?.close();}finally{store.close();rmSync(directory,{recursive:true,force:true});}
 }
});
