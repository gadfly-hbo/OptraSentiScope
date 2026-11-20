import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

async function boot(){
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'effect-runtime-fixture',principalId:'operator'},opened=[],schedules=[];
 const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,async deliver(m){return{accepted:true,messageId:m.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){const row={id:`schedule-${schedules.length}`,status:'active',target:{kind:'session',sessionId:options.sessionId},...request};schedules.push(row);return row;},async disableSchedule(id){const row=schedules.find(r=>r.id===id);if(row)row.status='paused';},async listSchedules(){return schedules;}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const c=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'},notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]}}),d=store.create(owner,{goal:'Synthetic bounded effect judgment',idempotencyKey:'create'});await c.sync(d.id);
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

test('an effect judgment reuses exact artifact versions and original outcome references without inferring attribution',async()=>{
 const f=await boot();try{
  const selected=await select(f),now=new Date().toISOString();
  const execution=await f.invoke('record_execution_fact',{expectedRevision:0,requestId:'effect-execution',artifact:selected.artifact,choiceId:selected.choice.id,scope:'Actual selected subset',status:'partial',asOf:now,startedAt:now,extent:'Only the stated portion started',evidence:[],statementIds:[selected.messageId],unknowns:['Rest unknown'],reason:'Saved statement, not verified execution'});
  const observation=await f.invoke('record_result_observation',{expectedRevision:0,requestId:'effect-observation',artifact:selected.artifact,choiceId:selected.choice.id,execution:{id:execution.id,revision:1},scope:'Actual selected subset',period:{from:now,to:now},observedAt:now,maturity:'immature',baseline:'Unknown comparability',measure:'Synthetic observation',result:'Reported improvement, attribution not established',comparability:'Limited period',gaps:['Longer comparable observation'],evidence:[],statementIds:[selected.messageId],unknowns:['Effect unknown'],reason:'Immature and sourced separately'});
  const judgment={kind:'judgment',title:'Bounded effect assessment',summary:'Improvement does not yet establish causation',evidence:[],assumptions:['Period remains immature'],unknowns:['Causal effect unknown'],applicability:'Only the actual selected subset',invalidatedBy:['Source qualification changes'],effect:{plan:selected.artifact,choiceId:selected.choice.id,execution:{id:execution.id,revision:1},observation:{id:observation.id,revision:1},scope:'Actual selected subset',evidenceConnection:'The exact partial execution and immature observation provide limited evidence',competingExplanations:['Other simultaneous changes remain possible'],limitations:['No completed comparison or mature period']}};
  const one=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'effect-v1',reason:'Preserve a limited assessment',content:judgment});
  const read=await f.invoke('read_artifact',{artifactId:one.artifactId,version:1});assert.deepEqual(read.content.effect,judgment.effect);assert.deepEqual(read.content.unknowns,judgment.unknowns);
  const two=await f.invoke('publish_artifact',{artifactId:one.artifactId,expectedVersion:1,requestId:'effect-v2',reason:'An explicit amended explanation, not automated learning',content:{...judgment,summary:'Same scope, more explicit unknowns',unknowns:['Effect and external factors remain unknown']}});assert.equal(two.version,2);
  assert.equal((await f.invoke('read_artifact',{artifactId:one.artifactId,version:1})).content.summary,judgment.summary);
  await f.invoke('publish_artifact',{artifactId:selected.artifact.artifactId,expectedVersion:1,requestId:'new-plan',reason:'A newer recommendation cannot acquire past facts',content:{...content,title:'New independent recommendation'}});
  await assert.rejects(f.invoke('publish_artifact',{expectedVersion:0,requestId:'wrong-plan-effect',reason:'Cannot splice old facts to latest plan',content:{...judgment,effect:{...judgment.effect,plan:{...selected.artifact,version:2}}}}));
  const detail=f.c.detail(f.d.id);assert.equal(detail.operatorChoices.length,1);assert.equal(detail.outcomeFeed.executions.length,1);assert.equal(detail.outcomeFeed.observations.length,1);
  assert.equal(detail.effectAssessments.length,2);assert.ok(detail.effectAssessments.every(v=>v.content.effect.plan.version===1));assert.equal(detail.artifactRevisions.some(v=>v.content?.effect),false,'Effect assessments must not replace the general current research judgment');
 }finally{await f.close();}
});
