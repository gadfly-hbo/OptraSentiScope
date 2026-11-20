import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

async function boot(){
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'outcome-runtime-fixture',principalId:'operator'},opened=[],schedules=[];
 const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,async deliver(m){return{accepted:true,messageId:m.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){const row={id:`schedule-${schedules.length}`,status:'active',target:{kind:'session',sessionId:options.sessionId},...request};schedules.push(row);return row;},async disableSchedule(id){const row=schedules.find(r=>r.id===id);if(row)row.status='paused';},async listSchedules(){return schedules;}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const c=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'},notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]}}),d=store.create(owner,{goal:'Synthetic actual-result facts only',idempotencyKey:'create'});await c.sync(d.id);
 const main=()=>opened.findLast(r=>r.binding.role==='main');
 const invoke=(name,args)=>{const tool=main().options.tools.find(t=>t.name===name);assert.ok(tool,`Missing Agent capability ${name}`);return tool.execute(args,{signal:new AbortController().signal});};
 return{store,owner,c,d,main,invoke,schedules,async close(){await c.close();store.close();}};
}
const content={kind:'plan',title:'Original synthetic plan',summary:'Only an original bounded proposal',evidence:[],assumptions:[],unknowns:['No operating effect established'],applicability:'Synthetic only',invalidatedBy:['Evidence changes'],recommendation:'Observe the selected scope',alternatives:[{option:'Wait',costs:'Unknown',risks:'Unknown'}],constraints:['Agent cannot perform operating actions'],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic observation',window:'Future evidence',source:'Authorized records or explicit statements',check:'Recheck'}};
async function select(f){
 const a=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'plan',reason:'Original synthetic proposal',content});
 const artifact={artifactId:a.artifactId,version:1};const decision=await f.invoke('propose_decision',{expectedRevision:0,requestId:'decision',artifact,title:'A limited choice',question:'Adopt the subset only?',options:[{id:'subset',label:'Subset',scope:'Selected subset',costs:'Unknown',risks:'Unknown'}],recommendation:{optionId:'subset',reason:'Limited synthetic evidence'},unknowns:['No execution'],nondecisionImpact:'Independent research continues',nextActions:['Track only actual facts'],window:{basis:'Synthetic future review',nextReviewAt:new Date(Date.now()+600000).toISOString()},reason:'Operating choice remains human'});
 await f.c.respondDecision(f.d.id,{id:decision.id,revision:1,artifact,requestId:'choice',action:'partial',optionId:'subset',scope:'Selected subset',text:'Adopt only the selected subset'});
 const choice=f.c.detail(f.d.id).operatorChoices[0];
 const updated=f.store.appendMessage(f.owner,f.d.id,{expectedVersion:f.store.get(f.owner,f.d.id).version,idempotencyKey:'actual-statement',text:'Synthetic statement: only a portion actually started; observation remains immature.'});
 return{artifact,choice,messageId:updated.messages.at(-1).id};
}
test('Agent result tools keep partial execution and immature observations separate from choice and native review',async()=>{
 const f=await boot();try{
  const selected=await select(f);assert.equal(f.c.detail(f.d.id).operatorChoices.length,1);
  const before=f.c.detail(f.d.id).outcomeFeed;assert.deepEqual(before?.executions??[],[]);assert.deepEqual(before?.observations??[],[]);
  const context=await f.invoke('research_context',{});assert.ok(context.operatorStatements?.some(m=>m.messageId===selected.messageId));assert.equal(JSON.stringify(context.operatorStatements).includes('Synthetic statement'),false);
  const statement=await f.invoke('read_operator_statement',{messageId:selected.messageId});assert.equal(statement.kind,'operator_statement');assert.match(statement.text,/Synthetic statement/);
  const now=new Date().toISOString();const executionInput={expectedRevision:0,requestId:'execution',artifact:selected.artifact,choiceId:selected.choice.id,scope:'Actual portion of selected subset',status:'partial',asOf:now,startedAt:now,extent:'Only the stated portion has started',evidence:[],statementIds:[selected.messageId],unknowns:['Remaining execution not confirmed'],reason:'Host-saved operator statement, not verified system execution'};const execution=await f.invoke('record_execution_fact',executionInput);
  const observation=await f.invoke('record_result_observation',{expectedRevision:0,requestId:'observation',artifact:selected.artifact,choiceId:selected.choice.id,execution:{id:execution.id,revision:1},scope:'Actual portion of selected subset',period:{from:now,to:now},observedAt:now,maturity:'immature',baseline:'No comparable baseline confirmed',measure:'Synthetic declared observation',result:'Observation period is not mature',comparability:'Cannot yet compare',gaps:['Future comparable data'],evidence:[],statementIds:[selected.messageId],unknowns:['Effect unknown'],reason:'Immaturity retained separately'});
  const review=await f.invoke('arrange_outcome_review',{requestId:'review',outcome:{kind:'observation',id:observation.id,revision:1},reason:'Recheck when authorized evidence can mature',dependencies:['Future authorized records'],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}});
  assert.deepEqual(review.outcome,{kind:'observation',id:observation.id,revision:1});assert.deepEqual(review.artifact,selected.artifact);
  assert.ok(f.schedules.some(s=>s.id===review.schedule.id&&s.timing.kind==='at'));
  const revised=await f.invoke('publish_artifact',{artifactId:selected.artifact.artifactId,expectedVersion:1,requestId:'plan-v2',reason:'New advice does not move past facts',content:{...content,title:'New synthetic recommendation'}});assert.equal(revised.version,2);
  await f.c.sync(f.d.id);
  assert.equal(f.c.detail(f.d.id).followups.find(r=>r.id===review.id).status,'waiting');
  assert.equal((await f.invoke('read_execution_fact',{id:execution.id,revision:1})).artifact.version,1);
  assert.equal((await f.invoke('read_result_observation',{id:observation.id,revision:1})).execution.revision,1);
  const detail=f.c.detail(f.d.id);assert.equal(detail.outcomeFeed.executions[0].status,'partial');assert.equal(detail.outcomeFeed.observations[0].maturity,'immature');assert.equal(detail.operatorChoices.length,1);assert.equal(detail.learning,undefined);
  await f.invoke('record_execution_fact',{...executionInput,id:execution.id,expectedRevision:1,requestId:'execution-v2',asOf:new Date().toISOString(),extent:'A later execution context has arrived'});
  await f.c.sync(f.d.id);assert.equal(f.c.detail(f.d.id).followups.find(r=>r.id===review.id).status,'superseded','A review planned before execution changed must be reconsidered');
  const original=await f.invoke('read_result_observation',{id:observation.id,revision:1});assert.equal(original.execution.revision,1,'The historical observation must not be moved to execution v2');
  const reconsidered=await f.invoke('arrange_outcome_review',{requestId:'review-reconsidered',outcome:{kind:'observation',id:observation.id,revision:1},reason:'Continue the original period after checking current execution',dependencies:['Future authorized original-period evidence'],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}});
  assert.deepEqual(reconsidered.outcomeContext,{execution:{id:execution.id,revision:2}});assert.equal((await f.invoke('read_result_observation',{id:observation.id,revision:1})).execution.revision,1);
  await f.invoke('record_execution_fact',{...executionInput,id:execution.id,expectedRevision:2,requestId:'execution-v3',asOf:new Date().toISOString(),extent:'Another later execution context'});
  await f.c.sync(f.d.id);assert.equal(f.c.detail(f.d.id).followups.find(r=>r.id===reconsidered.id).status,'superseded');

 }finally{await f.close();}
});
