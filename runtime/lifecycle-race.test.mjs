import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

const owner={enterpriseId:'lifecycle-race',principalId:'reviewer'};
function fixture({interrupt=true,delayFirst=false}={}){
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-lifecycle-race-')),store=new SentiStore({filename:join(directory,'business.sqlite')}),opened=[],schedules=[],deliveries=[];let started,release;const firstStarted=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const native={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,configured:true,inFlight:true,interruptCalls:0,async deliver(message){deliveries.push(message);return{accepted:true,messageId:message.id};},cancel(){this.inFlight=false;},...(interrupt?{interrupt(){this.interruptCalls++;this.inFlight=false;}}:{}),async whenIdle(){},async dispose(){this.inFlight=false;},async createSchedule(request){const row={id:`schedule-${schedules.length}`,status:'active',target:{kind:'session',sessionId:options.sessionId},...request};schedules.push(row);return row;},async disableSchedule(){},async retireSchedule(id){const row=schedules.find(item=>item.id===id);schedules.splice(schedules.indexOf(row),1);return row;},async listSchedules(){return schedules;}};opened.push(handle);if(delayFirst&&opened.length===1){started();await gate;}return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic-race',model:'none'},intervalSeconds:60});
 return{directory,store,coordinator,opened,schedules,deliveries,firstStarted,release:()=>release(),async close(){await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}

test('schedule and global pause cannot open duplicate generations or deliver after pause',async()=>{
 const f=fixture({delayFirst:true});try{
  const item=f.store.create(owner,{goal:'Schedule pause race',idempotencyKey:'create'});
  const scheduling=f.coordinator.scheduleEnd(item.id,{expectedRevision:0,at:new Date(Date.now()+120000).toISOString(),reason:'Initially valid schedule',idempotencyKey:'schedule'});await f.firstStarted;
  f.coordinator.pauseResearch(item.id,{expectedVersion:0,mode:'all',reason:'Pause while open pending',idempotencyKey:'pause'});
  assert.equal(f.opened.length,1);assert.equal(f.schedules.length,0);assert.equal(f.deliveries.length,0);
  f.release();const plan=await scheduling;await f.coordinator.sync(item.id);
  assert.equal(plan.status,'active');assert.equal(f.opened.length,1);assert.equal(f.schedules.length,1);assert.equal(f.schedules[0].title,'委托约定生命周期');assert.equal(f.deliveries.length,0);assert.equal(f.opened[0].inFlight,false);assert.equal(f.opened[0].interruptCalls,1);
  assert.equal(f.coordinator.detail(item.id).lifecycleControls.plans[0].status,'active');
 }finally{await f.close();}
});

test('interrupt UNKNOWN does not create new native resources on repeated reconciliation',async()=>{
 const f=fixture({interrupt:false});try{
  const item=f.store.create(owner,{goal:'Interrupt unknown retry',idempotencyKey:'create'});await f.coordinator.sync(item.id);
  const before={opens:f.opened.length,schedules:f.schedules.length,deliveries:f.deliveries.length};assert.ok(before.opens>0);
  f.coordinator.pauseResearch(item.id,{expectedVersion:0,mode:'all',reason:'Pause without interrupt',idempotencyKey:'pause'});
  await assert.rejects(f.coordinator.sync(item.id),{code:'research_interrupt_unknown'});
  const afterPause={opens:f.opened.length,schedules:f.schedules.length,deliveries:f.deliveries.length};
  await assert.rejects(f.coordinator.sync(item.id),{code:'research_interrupt_unknown'});
  assert.deepEqual({opens:f.opened.length,schedules:f.schedules.length,deliveries:f.deliveries.length},afterPause);
  assert.equal(f.coordinator.detail(item.id).researchStatus.status,'unknown');
 }finally{await f.close();}
});

test('global pause before first dispatch creates no main Session, Schedule or delivery',async()=>{
 const f=fixture({interrupt:false});try{
  const item=f.store.create(owner,{goal:'Pause before dispatch',idempotencyKey:'create'});f.coordinator.pauseResearch(item.id,{expectedVersion:0,mode:'all',reason:'No research yet',idempotencyKey:'pause'});
  await f.coordinator.sync(item.id);await f.coordinator.sync(item.id);
  assert.equal(f.opened.length,0);assert.equal(f.schedules.length,0);assert.equal(f.deliveries.length,0);assert.equal(f.coordinator.detail(item.id).researchStatus.status,'paused');
 }finally{await f.close();}
});
