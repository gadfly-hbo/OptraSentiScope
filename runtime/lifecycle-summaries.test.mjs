import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
import {LifecycleSummaryStore} from '../src/lifecycle-controls.ts';

async function boot({delegations=1}={}) {
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'lifecycle-summary-enterprise',principalId:'operator'},opened=[];
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-lifecycle-summary-')),fact=join(directory,'fact.txt');writeFileSync(fact,'version one');
 const native={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,configured:true,inFlight:true,interrupts:0,disposed:false,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){this.inFlight=false;},interrupt(){this.interrupts++;this.inFlight=false;},async whenIdle(){},async dispose(){this.disposed=true;this.inFlight=false;},async createSchedule(request){return{id:`schedule-${opened.length}-${Math.random()}`,...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic-fixture',model:'none'},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5,6,7]}});
 const items=Array.from({length:delegations},(_,index)=>store.create(owner,{goal:`Synthetic lifecycle summary ${index+1}`,idempotencyKey:`create-${index}`}));
 for(const item of items)coordinator.configureSources(item.id,[{sourceId:'shared',directory,grantRevision:1,enabled:true}]);
 await coordinator.sync(items[0].id);for(const item of items.slice(1))await coordinator.sync(item.id);
 const invoke=(run,name,args)=>run.options.tools.find(tool=>tool.name===name).execute(args,{signal:new AbortController().signal});
 const main=id=>opened.filter(run=>run.binding.delegationId===id&&run.binding.role==='main').at(-1);
 const worker=id=>opened.filter(run=>run.binding.delegationId===id&&run.binding.role==='worker').at(-1);
 return{store,owner,coordinator,directory,fact,items,opened,invoke,main,worker,async close(){await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}
async function ticket(f,id){
 const main=f.main(id),context=await f.invoke(main,'research_context',{}),candidate=context.candidates[0];
 await f.invoke(main,'decide_event',{triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:'accept',title:'In-flight direction',scope:'P1',reason:'Synthetic active work'});await f.coordinator.sync(id);return f.worker(id);
}
async function control(f,id,action){
 const current=f.store.get(f.owner,id),requested=f.store.requestLifecycle(f.owner,id,{action,expectedVersion:current.version,idempotencyKey:`${action}-${current.version}`}),operation=requested.pendingOperation;
 const result=await f.coordinator.controlPort.settle({owner:f.owner,delegation:requested,operation,isCurrent:()=>true});
 f.store.completeLifecycle(f.owner,id,{operationId:operation.id,expectedVersion:operation.requestedVersion,...result});await f.coordinator.sync(id);return result;
}
const plan={kind:'plan',title:'Synthetic end summary plan',summary:'Preserve exact plan reference',evidence:[],assumptions:[],unknowns:['Effect remains unknown'],applicability:'Synthetic only',invalidatedBy:['New evidence'],recommendation:'Adopt scope A only',alternatives:[{option:'Wait',costs:'Unknown',risks:'Missing evidence'}],constraints:['No operating action'],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic',window:'Synthetic window',source:'Synthetic only',check:'Review current evidence'}};

test('global research pause interrupts main, retires worker, preserves unrelated work and writes one factual resume summary',async()=>{
 const f=await boot({delegations:2}),[a,b]=f.items;
 try{
  const worker=await ticket(f,a.id),mainA=f.main(a.id),mainB=f.main(b.id);
  f.coordinator.pauseResearch(a.id,{expectedVersion:0,mode:'all',reason:'Wait for synthetic input',idempotencyKey:'pause-all'});
  await f.coordinator.sync(a.id);
  assert.equal(mainA.handle.interrupts,1);assert.equal(mainA.handle.inFlight,false);assert.equal(worker.handle.disposed,true);assert.equal(mainB.handle.interrupts,0);assert.equal(mainB.handle.inFlight,true);
  writeFileSync(f.fact,'version two');await f.coordinator.sync(a.id);
  assert.equal(f.coordinator.detail(a.id).sourceReferences.at(-1).version,f.coordinator.detail(b.id).sourceReferences.at(-1).version,'authorized collection continues during research-only pause');
  f.coordinator.resumeResearch(a.id,{expectedVersion:1,reason:'Synthetic input is available',idempotencyKey:'resume-all'});await f.coordinator.sync(a.id);
  assert.equal(await f.main(a.id).options.beforeStep(f.main(a.id).binding,{turn:2,step:1,scheduledOnly:false}),true);
  const summaries=f.coordinator.detail(a.id).lifecycleSummaries;
  assert.equal(summaries.length,1);assert.equal(summaries[0].kind,'resume');assert.ok(summaries[0].sections.changes.some(item=>item.kind==='source_updated'));assert.ok(summaries[0].sections.continuations.length>=1);
  const createdAt=summaries[0].createdAt;await f.coordinator.sync(a.id);assert.equal(f.coordinator.detail(a.id).lifecycleSummaries.length,1);assert.equal(f.coordinator.detail(a.id).lifecycleSummaries[0].createdAt,createdAt);
 }finally{await f.close();}
});

test('end summary preserves exact plan, choice, execution, observation and remains unchanged after late work is rejected',async()=>{
 const f=await boot(),id=f.items[0].id;
 try{
  const main=f.main(id),artifact=await f.invoke(main,'publish_artifact',{expectedVersion:0,requestId:'end-plan',reason:'Synthetic plan',content:plan}),ref={artifactId:artifact.artifactId,version:artifact.version};
  const decision=await f.invoke(main,'propose_decision',{expectedRevision:0,requestId:'end-decision',artifact:ref,title:'Synthetic choice',question:'Choose A?',options:[{id:'a',label:'A',scope:'A only',costs:'Unknown',risks:'Unknown'}],recommendation:{optionId:'a',reason:'Synthetic'},unknowns:['Effect unknown'],nondecisionImpact:'Only dependent work waits',nextActions:['Continue independent research'],window:{basis:'No hard deadline',nextReviewAt:new Date(Date.now()+60000).toISOString()},reason:'Operator choice required'});
  await f.coordinator.respondDecision(id,{id:decision.id,revision:decision.revision,artifact:ref,requestId:'adopt-a',action:'adopt',optionId:'a',scope:'A only',text:'Adopt A only'});await f.coordinator.sync(id);
  const choice=f.coordinator.detail(id).operatorChoices[0],at=new Date().toISOString();
  const withStatement=f.store.appendMessage(f.owner,id,{expectedVersion:f.store.get(f.owner,id).version,idempotencyKey:'execution-statement',text:'负责人合成陈述：范围A已执行并完成一次观察。'}),statementId=withStatement.messages.at(-1).id;
  const execution=await f.invoke(main,'record_execution_fact',{expectedRevision:0,requestId:'end-execution',artifact:ref,choiceId:choice.id,scope:'A only',evidence:[],statementIds:[statementId],unknowns:[],reason:'Synthetic execution fact',status:'completed',asOf:at,extent:'Synthetic execution completed'});
  await f.invoke(main,'record_result_observation',{expectedRevision:0,requestId:'end-observation',artifact:ref,choiceId:choice.id,scope:'A only',evidence:[],statementIds:[statementId],unknowns:[],reason:'Synthetic observation',execution:{id:execution.id,revision:execution.revision},period:{from:at,to:at},observedAt:at,maturity:'mature',baseline:'Synthetic baseline',measure:'Synthetic measure',result:'Synthetic observation only; no attribution',comparability:'Synthetic comparison only',gaps:[]});
  await control(f,id,'end');
  const detail=f.coordinator.detail(id),summary=detail.lifecycleSummaries.find(item=>item.kind==='end');
  assert.ok(summary);assert.equal(summary.sections.plans.length,1);assert.equal(summary.sections.choices.length,1);assert.equal(summary.sections.executions.length,1);assert.equal(summary.sections.observations.length,1);
  const frozen=JSON.stringify(summary);await assert.rejects(f.invoke(main,'publish_artifact',{expectedVersion:0,requestId:'late-plan',reason:'Late result must not revive',content:{...plan,title:'Late plan'}}));await f.coordinator.sync(id);
  assert.equal(JSON.stringify(f.coordinator.detail(id).lifecycleSummaries.find(item=>item.kind==='end')),frozen);
 }finally{await f.close();}
});

test('lifecycle summaries reopen from SQLite without regeneration',()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-lifecycle-summary-store-')),filename=join(directory,'business.sqlite'),owner={enterpriseId:'summary-reopen',principalId:'operator'};let store=new SentiStore({filename});
 try{
  const item=store.create(owner,{goal:'Persistent summary',idempotencyKey:'create'}),id='resume-operation';
  const first=new LifecycleSummaryStore(store,{owner,delegationId:item.id}).record(id,'resume','2026-11-01T00:00:00.000Z',{changes:[{kind:'source_updated',id:'event-1'}],gaps:[],eligible:[],continuations:[],waiting:[]});
  store.close();store=new SentiStore({filename});const reopened=new LifecycleSummaryStore(store,{owner,delegationId:item.id});
  assert.deepEqual(reopened.list(),[first]);assert.deepEqual(reopened.record(id,'resume','2026-11-02T00:00:00.000Z',{changes:[],gaps:[],eligible:[],continuations:[],waiting:[]}),first);
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
