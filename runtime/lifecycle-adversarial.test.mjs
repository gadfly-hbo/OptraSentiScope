import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

const owner={enterpriseId:'lifecycle-adversarial',principalId:'reviewer'};
function fixture({interrupt=true}={}){const directory=mkdtempSync(join(tmpdir(),'sentiscope-lifecycle-adversarial-')),store=new SentiStore({filename:join(directory,'business.sqlite')}),opened=[],schedules=[],deliveries=[];
 const native={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,configured:true,inFlight:true,async deliver(message){deliveries.push(message);return{accepted:true,messageId:message.id};},cancel(){this.inFlight=false;},...(interrupt?{interrupt(){this.inFlight=false;}}:{}),async whenIdle(){},async dispose(){this.inFlight=false;},async createSchedule(request){const row={id:`schedule-${schedules.length}`,status:'active',target:{kind:'session',sessionId:options.sessionId},...request};schedules.push(row);return row;},async disableSchedule(){},async listSchedules(){return schedules;}};opened.push(handle);return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60});
 return{directory,store,coordinator,opened,schedules,deliveries,async close(){await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}};}

test('stale lifecycle scheduling has no native open, Schedule or delivery before rejection',async()=>{
 const f=fixture();try{
  const item=f.store.create(owner,{goal:'Stale lifecycle CAS',idempotencyKey:'create'});
  await assert.rejects(f.coordinator.scheduleEnd(item.id,{expectedRevision:99,at:new Date(Date.now()+60000).toISOString(),reason:'Stale request',idempotencyKey:'stale-end'}),{code:'lifecycle_control_conflict'});
  assert.equal(f.opened.length,0);assert.equal(f.schedules.length,0);assert.equal(f.deliveries.length,0);
 }finally{await f.close();}
});

test('a native port without interrupt leaves pause UNKNOWN instead of following',async()=>{
 const f=fixture({interrupt:false});try{
  const item=f.store.create(owner,{goal:'Missing interrupt capability',idempotencyKey:'create'});f.coordinator.pauseResearch(item.id,{expectedVersion:0,mode:'all',reason:'Pause without interrupt',idempotencyKey:'pause'});
  await assert.rejects(f.coordinator.sync(item.id),{code:'research_interrupt_unknown'});
  const detail=f.coordinator.detail(item.id);assert.equal(detail.researchStatus.status,'unknown');assert.ok(detail.technical.some(entry=>entry.kind==='research_interrupt_unknown'&&entry.detail.reason==='interrupt_unavailable'));assert.equal(detail.technical.some(entry=>entry.kind==='research_interrupted'),false);
 }finally{await f.close();}
});

test('end summary retains a pending assessment and resume waiting includes the same durable work',async()=>{
 const f=fixture(),sourceDirectory=join(f.directory,'authorized');mkdirSync(sourceDirectory);writeFileSync(join(sourceDirectory,'fact.txt'),'pending assessment');
 try{
  const item=f.store.create(owner,{goal:'Pending assessment summary',idempotencyKey:'create'});f.coordinator.pauseResearch(item.id,{expectedVersion:0,mode:'all',reason:'Hold assessment',idempotencyKey:'pause'});f.coordinator.configureSources(item.id,[{sourceId:'shared',directory:sourceDirectory,grantRevision:1,enabled:true}]);await f.coordinator.sync(item.id);
  assert.ok(f.coordinator.detail(item.id).deliveries.some(entry=>entry.kind==='assess'&&entry.state==='pending'));
  const requested=f.store.requestLifecycle(owner,item.id,{action:'end',expectedVersion:f.store.get(owner,item.id).version,idempotencyKey:'end'}),operation=requested.pendingOperation,settled=await f.coordinator.controlPort.settle({owner,delegation:requested,operation,isCurrent:()=>true});f.store.completeLifecycle(owner,item.id,{operationId:operation.id,expectedVersion:operation.requestedVersion,...settled});await f.coordinator.sync(item.id);
  const ended=f.coordinator.detail(item.id),summary=ended.lifecycleSummaries.find(entry=>entry.kind==='end');assert.ok(summary.sections.pending.some(entry=>entry.kind==='delivery_pending'&&entry.detail==='assess'));
 }finally{await f.close();}
});
