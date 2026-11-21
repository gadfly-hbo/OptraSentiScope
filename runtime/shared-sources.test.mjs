import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

async function boot({delegations=1}={}) {
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'shared-source-enterprise',principalId:'operator'},opened=[];
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-shared-source-')),fact=join(directory,'fact.txt');writeFileSync(fact,'version one');
 const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${opened.length}-${Math.random()}`,...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic-fixture',model:'none'},intervalSeconds:60});
 const items=Array.from({length:delegations},(_,index)=>store.create(owner,{goal:`Synthetic shared source goal ${index+1}`,idempotencyKey:`create-${index}`}));
 const invoke=(run,name,args)=>run.options.tools.find(tool=>tool.name===name).execute(args,{signal:new AbortController().signal});
 const main=id=>opened.filter(run=>run.binding.delegationId===id&&run.binding.role==='main').at(-1);
 return{store,owner,coordinator,directory,fact,items,opened,invoke,main,async close(){await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}

test('one shared acquisition fans out to independent grants and one revocation does not stop the other delegation',async()=>{
 const f=await boot({delegations:2}),[a,b]=f.items;
 try{
  for(const item of [a,b])f.coordinator.configureSources(item.id,[{sourceId:'shared',directory:f.directory,grantRevision:1,enabled:true}]);
  await f.coordinator.sync(a.id);await f.coordinator.sync(b.id);
  writeFileSync(f.fact,'version two');await f.coordinator.sync(a.id);await f.coordinator.sync(b.id);
  const contextA=await f.invoke(f.main(a.id),'research_context',{}),contextB=await f.invoke(f.main(b.id),'research_context',{});
  const updateA=contextA.sourceEvents.find(event=>event.kind==='updated'),updateB=contextB.sourceEvents.find(event=>event.kind==='updated');
  assert.ok(updateA?.collectionId,'shared source events must identify their Host acquisition');
  assert.equal(updateA.collectionId,updateB.collectionId,'both delegations must receive the same acquisition rather than independently collecting the update');
  assert.notEqual(updateA.eventId,updateB.eventId,'each delegation keeps its own durable receipt');
  assert.equal(updateA.record.hash,updateB.record.hash);
  f.coordinator.configureSources(a.id,[]);await f.coordinator.sync(a.id);await f.coordinator.sync(b.id);
  await assert.rejects(f.invoke(f.main(a.id),'read_source',{ref:updateA.ref,hash:updateA.record.hash}),{code:'source_revoked'});
  const stillAuthorized=await f.invoke(f.main(b.id),'read_source',{ref:updateB.ref,hash:updateB.record.hash});
  assert.equal(stillAuthorized.text,'version two');
  assert.equal(f.coordinator.detail(a.id).sources[0].status,'revoked');
  assert.equal(f.coordinator.detail(b.id).sources[0].status,'ready');
  assert.equal(await f.main(b.id).options.beforeStep(f.main(b.id).binding,{scheduledOnly:false}),true,'the remaining grant must keep its native research eligibility');
 }finally{await f.close();}
});

test('one source update can supplement an existing ticket and establish an independent research question without duplicate effects',async()=>{
 const f=await boot(),id=f.items[0].id;
 try{
  f.coordinator.configureSources(id,[{sourceId:'shared',directory:f.directory,grantRevision:1,enabled:true}]);
  await f.coordinator.sync(id);
  let main=f.main(id),context=await f.invoke(main,'research_context',{}),candidate=context.candidates[0];
  const first=await f.invoke(main,'decide_event',{triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:'accept',title:'Existing research',scope:'existing-direction',reason:'Initial synthetic research question'});
  await f.coordinator.sync(id);
  writeFileSync(f.fact,'version two changes existing evidence and reveals a separate question');
  await f.coordinator.sync(id);
  main=f.main(id);context=await f.invoke(main,'research_context',{});
  candidate=context.candidates.find(item=>item.triggers.some(trigger=>trigger.meta?.kind==='updated'));
  assert.ok(candidate,'the source update needs an official Engine evaluation');
  await f.invoke(main,'note_ticket',{ticketId:first.decision.ticketId,text:'The same source update supplements the existing research.'});
  await f.invoke(main,'decide_event',{triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:'accept',title:'Independent question',scope:'independent-direction',reason:'The same update also establishes a separate question'});
  await f.coordinator.sync(id);await f.coordinator.sync(id);
  const detail=f.coordinator.detail(id),existing=detail.research.find(ticket=>ticket.id===first.decision.ticketId);
  assert.equal(detail.research.length,2);
  assert.ok(existing.inputs.some(input=>input.text==='The same source update supplements the existing research.'));
  assert.ok(detail.research.some(ticket=>ticket.title==='Independent question'&&ticket.mandate.scope==='independent-direction'));
  const events=(await f.invoke(f.main(id),'research_context',{})).sourceEvents.filter(event=>event.kind==='updated');
  assert.equal(events.length,1,'duplicate checks must not repeat the source effect');
 }finally{await f.close();}
});
