import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
import {EngineStore} from '../src/engine-store.ts';
const project=resolve(import.meta.dirname,'..');
// Real official Engine with deterministic native port fixtures; actual SDK behavior is checked separately.
async function boot({failSchedule=false,failDispose=false,controls}={}) {
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'independent',principalId:'review'},opened=[],delivered=[];
 const effects={schedules:0,disabled:0};
 const native={async open(binding,options){
  if(!options.admit(binding,'open'))throw Error('NATIVE_ADMISSION_DENIED');
  const handle={binding,sessionId:options.sessionId,configured:true,
   async deliver(message){delivered.push({binding,sessionId:options.sessionId,...message});return {messageId:message.id,accepted:true};},
   cancel(){},async whenIdle(){},async dispose(){if(failDispose)throw Error('Disposal not confirmed');},
   async createSchedule(){effects.schedules++;if(failSchedule)throw Error('created-but-receipt-lost');return {id:'schedule-'+opened.length};},
   async disableSchedule(){effects.disabled++;},async listSchedules(){return [];}};
  opened.push({binding,options,handle});return handle;
 },async dispose(){}};
 const c=new ResearchCoordinator({store,owner,native,Engine,controls,model:{provider:'synthetic-never-called',model:'none'}});
 const d=store.create(owner,{goal:'Synthetic continuous engineering goal',idempotencyKey:'create'});
 const invoke=(run,name,args)=>run.options.tools.find(t=>t.name===name).execute(args,{signal:new AbortController().signal});
 const shutdown=async()=>{let error;try{await c.close();}catch(e){error=e.message;}store.close();return error;};
 return {store,owner,opened,delivered,effects,c,d,invoke,shutdown};
}
async function establishTicket(f) {
 await f.c.sync(f.d.id);
 const main=f.opened.find(x=>x.binding.role==='main');
 const context=await f.invoke(main,'research_context',{}),candidate=context.candidates[0];
 await f.invoke(main,'decide_event',{triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:'accept',title:'Synthetic ticket',scope:'Only current authorized evidence',reason:'Independent engineering fixture'});
 await f.c.sync(f.d.id);return main;
}
async function control(f,action) {
 const requested=f.store.requestLifecycle(f.owner,f.d.id,{action,expectedVersion:f.store.get(f.owner,f.d.id).version,idempotencyKey:action}),op=requested.pendingOperation;
 const result=await f.c.controlPort.settle({owner:f.owner,delegation:requested,operation:op,isCurrent:()=>true});
 f.store.completeLifecycle(f.owner,f.d.id,{operationId:op.id,expectedVersion:op.requestedVersion,...result});await f.c.sync(f.d.id);return result;
}

test('goal revision gets a fresh official evaluation and no old mandate execution',async()=>{

 const f=await boot();
 try {
  await establishTicket(f);
  f.store.adjust(f.owner,f.d.id,{goal:'Synthetic revision two',expectedVersion:f.store.get(f.owner,f.d.id).version,idempotencyKey:'adjust'});await f.c.sync(f.d.id);
  const detail=f.c.detail(f.d.id),assessments=f.delivered.filter(x=>x.binding.goalRevision===2&&x.text.startsWith('SENTISCOPE_ASSESS'));
  const checked=({name:'goal-revision-continues',safe:assessments.length>0,revision:f.store.get(f.owner,f.d.id).goalRevision,assessmentsRevision2:assessments.length,tickets:detail.research.map(t=>({policy:t.mandate.policyVersion,state:t.assignments.at(-1)?.state,undelivered:t.undelivered.length})),facts:detail.technical.slice(-4)});
  assert.equal(checked.safe,true,JSON.stringify(checked));
 } finally {await f.shutdown();}

});
test('source-derived notes do not gain authority in a fresh source epoch',async()=>{

 const f=await boot();
 try {
  const main=await establishTicket(f),ticket=f.c.detail(f.d.id).research[0];
  // A lawful main tool can summarize source-derived text into a note. Withdrawal
  // occurs before after-commit delivery; a new native epoch must not requalify it.
  const note=f.invoke(main,'note_ticket',{ticketId:ticket.id,text:'SYNTHETIC_SOURCE_BODY_FROM_OLD_EPOCH'});
  f.c.configureSources(f.d.id,[{sourceId:'revoked-fixture',directory:resolve(project,'.local/archives/engine-runtime-v01-20261116/independent/no-such-source'),grantRevision:1,enabled:false}]);
  await note;await f.c.sync(f.d.id);
  const leaked=f.delivered.filter(x=>x.binding.epoch>main.binding.epoch&&x.text.includes('SYNTHETIC_SOURCE_BODY_FROM_OLD_EPOCH'));
  const checked=({name:'old-note-is-not-requalified',safe:leaked.length===0,sourceStatus:f.c.detail(f.d.id).sources[0].status,oldEpoch:main.binding.epoch,leaked:leaked.map(x=>({role:x.binding.role,epoch:x.binding.epoch,text:x.text}))});
  assert.equal(checked.safe,true,JSON.stringify(checked));
 } finally {await f.shutdown();}

});
test('confirmed native-unread inputs survive pause and fresh session recovery',async()=>{

 const f=await boot();
 try {
  await establishTicket(f);
  f.store.appendMessage(f.owner,f.d.id,{text:'UNREAD_OPERATOR_FOLLOWUP',expectedVersion:f.store.get(f.owner,f.d.id).version,idempotencyKey:'followup'});await f.c.sync(f.d.id);
  const oldWorker=f.opened.find(x=>x.binding.role==='worker'),before=f.c.detail(f.d.id).research[0];
  const beforePause={undelivered:before.undelivered.length,readAt:before.inputs.find(x=>x.kind==='trigger')?.readAt,queuedNative:f.delivered.some(x=>x.binding.role==='worker'&&x.text.includes('UNREAD_OPERATOR_FOLLOWUP'))};
  await control(f,'pause');await control(f,'resume');
  const fresh=f.opened.filter(x=>x.binding.role==='worker'&&x.handle.sessionId!==oldWorker.handle.sessionId),carried=f.delivered.filter(x=>fresh.some(n=>n.handle.sessionId===x.sessionId)&&x.text.includes('UNREAD_OPERATOR_FOLLOWUP'));
  const checked=({name:'confirmed-unread-input-survives-pause',safe:carried.length>0,beforePause,state:f.store.get(f.owner,f.d.id).lifecycle,newWorkerCount:fresh.length,followupInFreshSession:carried.length,undelivered:f.c.detail(f.d.id).research[0].undelivered.length});
  assert.equal(checked.safe,true,JSON.stringify(checked));
 } finally {await f.shutdown();}

});
test('unknown Schedule creation never certifies stopped',async()=>{

 const f=await boot({failSchedule:true});
 try {
  let initialFailure;try{await f.c.sync(f.d.id);}catch(e){initialFailure=e.message;}
  const requested=f.store.requestLifecycle(f.owner,f.d.id,{action:'pause',expectedVersion:f.d.version,idempotencyKey:'pause'});
  let result;try{result=await f.c.controlPort.settle({owner:f.owner,delegation:requested,operation:requested.pendingOperation,isCurrent:()=>true});}catch(e){result={outcome:'unknown',error:e.message};}
  const checked=({name:'unknown-schedule-does-not-confirm-stop',safe:result.outcome!=='stopped',initialFailure,result,effects:f.effects,run:f.store.connection.prepare('SELECT value FROM research_runs').all().map(x=>JSON.parse(x.value))});
  assert.equal(checked.safe,true,JSON.stringify(checked));
 } finally {await f.shutdown();}

});
test('canonical tool outputs contain no undefined fields and unconfigured restart keeps saved history visible',async()=>{
 const f=await boot();try {await establishTicket(f);const main=f.opened.find(x=>x.binding.role==='main');
 const context=await f.invoke(main,'research_context',{});assert.deepEqual(context,JSON.parse(JSON.stringify(context)));
 const worker=f.opened.find(x=>x.binding.role==='worker');await f.invoke(worker,'report_research',{state:'progress',summary:'Explicit engineering report without external evidence',evidence:[]});await f.c.sync(f.d.id);
 await f.c.close();const offline=new ResearchCoordinator({store:f.store,owner:f.owner,Engine,native:{async open(){throw Error('MUST NOT OPEN');},async dispose(){}}});
 assert.equal(offline.detail(f.d.id).researchStatus.status,'unconfigured');assert.equal(offline.detail(f.d.id).artifacts.length,1);await offline.close();
 }finally {await f.shutdown();}
});
test('uncertain public-port intents survive reconciliation without another admission',async()=>{
 const f=await boot();try {await f.c.sync(f.d.id);const main=f.opened[0],c=await f.invoke(main,'research_context',{});
 const db=new EngineStore(f.store,{owner:f.owner,delegationId:f.d.id});db.assessor.request({...c.candidates[0],evalId:'technical-uncertain-fixture'});
 const intent=db.listPending().find(i=>i.key==='technical-uncertain-fixture');db.claim(intent.id);
 const count=f.delivered.length;await f.c.sync(f.d.id);assert.equal(db.get(intent.id).state,'claimed');assert.equal(f.delivered.length,count);
 }finally{await f.shutdown();}
});

test('unconfirmed native disposal stays UNKNOWN when the next dispatch also waits for resources',async()=>{
 let available=true;const controls={ensureDefaults(){},canStart(){return available;},snapshot(){return {modelDispatch:available?'eligible':'waiting_resources',activeModelRequests:0,block:'host_resource_unconfirmed'};}};const f=await boot({failDispose:true,controls});
 try{await establishTicket(f);available=false;f.c.haltForResources(f.opened[0].binding,'host_resource_unconfirmed');await f.c.sync(f.d.id);assert.equal(f.c.detail(f.d.id).researchStatus.status,'unknown');}finally{await f.shutdown();}
});
