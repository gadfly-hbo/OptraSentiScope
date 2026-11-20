import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,basename,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {ScheduleId} from '@deepseek-ai/dsh-schedule';
import {startProductHost} from 'sentiscope-runtime/plugin';

export const name='sentiscope-cognition-reassessment-engineering';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const provider='sentiscope-cognition-reassessment-local',model='synthetic',maxTokens=96;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(predicate,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await pause(20);}throw Error(`Engineering check timed out: ${label}`);}
const text=message=>message?.content?.filter(block=>block.type==='text').map(block=>block.text).join('\n')??'';
const value=message=>{try{return JSON.parse(text(message));}catch{return undefined;}};
const hash=input=>createHash('sha256').update(input).digest('hex');
const reference=revision=>({artifactId:revision.artifactId,version:revision.version});

/** Scripted local transport only: it exercises the public Agent/tool path, never real reasoning quality. */
class Synthetic extends LlmAdapter{
 calls=[];pending=new Map();phase='setup';mainSession;workerSessions=new Set();ticketId;
  evidence;updatedEvidence;sourceEvent;plans=[];judgment;secondJudgment;relations=[];review;tasks=[];firstDone;secondDone;followup;observed;recoveryTask;
 constructor(state){super();this.state=state;}
 plan(index){return{kind:'plan',title:`Synthetic dependent proposal P${index+1}`,summary:`${this.state.sentinel}: dependent proposal ${index+1}`,evidence:[this.evidence],assumptions:['Only this isolated synthetic fixture'],unknowns:['No business effect established'],applicability:`Only synthetic dependent scope ${index+1}`,invalidatedBy:['The supporting mechanism changes'],recommendation:'Use only the declared synthetic scope',alternatives:[{option:'Wait',costs:'Unknown',risks:'The question remains unresolved'}],constraints:['No operating action or computation'],observation:{baseline:'Synthetic baseline',expectedChange:'Unknown',measure:'Exact synthetic fixture',window:'A later exact check',source:'Authorized synthetic source',check:'Recheck the declared condition'}};}
 get judgmentContent(){return{kind:'judgment',title:'Synthetic supporting judgment J1',summary:`${this.state.sentinel}: mechanism supports P1 and P2 under the declared condition`,evidence:[this.evidence],assumptions:['Synthetic engineering only'],unknowns:['Real research quality unknown'],applicability:'Only the declared synthetic mechanism condition',invalidatedBy:['An authorized source counterexample']};}
 ingest(options,data,last){
  const pending=this.pending.get(options.sessionId);if(last?.role!=='tool'||!pending)return;
  if(pending==='read_source'&&data?.record&&!this.updatedEvidence)this.evidence={ref:data.record.ref,hash:data.record.hash};
  if(pending==='read_updated_source'&&data?.record)this.updatedEvidence={ref:data.record.ref,hash:data.record.hash};
  if(pending==='publish_plan'&&data?.artifactId&&!this.plans.some(plan=>plan.artifactId===data.artifactId))this.plans.push(structuredClone(data));
  if(pending==='publish_judgment'&&data?.artifactId)this.judgment=structuredClone(data);
  if(pending==='publish_second_judgment'&&data?.artifactId)this.secondJudgment=structuredClone(data);
  if(pending==='declare_support'&&data?.id)this.relations.push(structuredClone(data));
  if(pending==='research_context'&&data?.sourceEvents)this.sourceEvent=data.sourceEvents.filter(event=>event.sourceId==='fixture').at(-1);
  if(pending==='cognition_review'&&data?.id){this.review=structuredClone(data);this.tasks=structuredClone(data.reevaluations);}
  if(pending==='complete_plan'&&data?.id){if(data.id===this.tasks[0]?.id)this.firstDone=structuredClone(data);if(data.id===this.tasks[1]?.id)this.secondDone=structuredClone(data);}
  if(pending==='arrange_followup'&&data?.id)this.followup=structuredClone(data);
  if(pending==='observe_followup'&&data?.id)this.observed=structuredClone(data);
  if(pending==='decide_event'&&data?.decision?.ticketId)this.ticketId=data.decision.ticketId;
  this.pending.delete(options.sessionId);
 }
 choose(options){
  const messages=options.messages.filter(message=>message.role==='user'),latest=text(messages.at(-1)),last=options.messages.at(-1),data=last?.role==='tool'?value(last):undefined;
  if(messages.some(message=>text(message).includes('SENTISCOPE_WORKER'))){
   this.workerSessions.add(options.sessionId);const pending=this.pending.get(options.sessionId);this.pending.delete(options.sessionId);
   if(this.phase!=='evidence'&&this.phase!=='revoked')return;
   if(last?.role!=='tool')return['list_sources',{},'list_sources'];
   if(pending==='list_sources'&&data?.references?.length)return['read_source',{ref:data.references.at(-1).ref,hash:data.references.at(-1).hash},'read_source'];
   if(pending==='read_source'&&data?.record)return['report_research',{state:'progress',summary:`${this.state.independentSentinel}: independent P3 research continues; it does not depend on J1.`,evidence:[{ref:data.record.ref,hash:data.record.hash}]}];
   return;
  }
  this.mainSession=options.sessionId;this.ingest(options,data,last);
  let assessment;if(latest.startsWith('SENTISCOPE_ASSESS\n'))try{assessment=JSON.parse(latest.split('\n')[1]);}catch{}
  if(assessment&&last?.role!=='tool'){const source=assessment.candidate??assessment;if(this.phase==='evidence'&&source?.triggers?.length)return['decide_event',{triggerId:source.triggers[0].id,evalId:source.evalId,kind:'accept',reason:'The authorized source update exposes independent P3 research while the main Agent rechecks cognition',title:'Independent synthetic P3 research',scope:'Only unrelated synthetic P3'},'decide_event'];return['decide_event',{triggerId:source?.triggers?.[0]?.id,evalId:source?.evalId,kind:'ignore',reason:'The initial setup candidate is covered by the explicit cognition fixture'},'decide_event'];}
  if(this.phase==='setup'){
   if(last?.role!=='tool')return['list_sources',{},'list_sources'];
   if(!this.evidence&&data?.references?.length)return['read_source',{ref:data.references.at(-1).ref,hash:data.references.at(-1).hash},'read_source'];
   if(this.evidence&&this.plans.length<2)return['publish_artifact',{expectedVersion:0,requestId:`plan-${this.plans.length+1}`,reason:'Synthetic dependent proposal',content:this.plan(this.plans.length)},'publish_plan'];
   if(this.plans.length===2&&!this.judgment)return['publish_artifact',{expectedVersion:0,requestId:'judgment-v1',reason:'Initial supporting judgment',content:this.judgmentContent},'publish_judgment'];
   if(this.judgment&&this.relations.length<2){const plan=this.plans[this.relations.length];return['declare_support_dependency',{requestId:`support-${plan.artifactId}`,judgment:reference(this.judgment),plan:reference(plan),scope:`Only declared dependent scope ${this.relations.length+1}`,why:`P${this.relations.length+1} depends on J1 as its key mechanism precondition`,reason:'Agent read both exact versions and declared the explicit business support'},'declare_support'];}
   return;
  }
  if(this.phase==='evidence'){
   if(last?.role!=='tool')return['research_context',{},'research_context'];
   if(!this.sourceEvent&&data?.sourceEvents)return['research_context',{},'research_context'];
   if(!this.updatedEvidence&&data?.references?.length)return['read_source',{ref:data.references.at(-1).ref,hash:data.references.at(-1).hash},'read_updated_source'];
   if(this.updatedEvidence&&!this.secondJudgment)return['publish_artifact',{artifactId:this.judgment.artifactId,expectedVersion:1,requestId:'judgment-v2',reason:'The authorized counterexample limits the mechanism',content:{...this.judgmentContent,evidence:[this.updatedEvidence],summary:`${this.state.counterexampleSentinel}: mechanism support is now limited`}},'publish_second_judgment'];
   if(this.secondJudgment&&!this.review)return['record_cognition_review',{requestId:'cognition-review-v1',judgment:reference(this.judgment),resultJudgment:reference(this.secondJudgment),trigger:{kind:'source_event',eventId:this.sourceEvent.eventId,sourceId:this.sourceEvent.sourceId,observedAt:this.sourceEvent.observedAt},conclusion:'revised',summary:`${this.state.counterexampleSentinel}: the exact source limits J1`,reason:'P1 and P2 need separate reassessment; P3 remains independent',changes:['P2 no longer has unconditional mechanism support'],limitations:['No causal business-effect claim'],unknowns:['The narrowed P2 condition remains unknown'],nextReview:{condition:'After exact P1 and P2 reassessment'}},'cognition_review'];
   if(this.review&&!this.firstDone)return['record_plan_reassessment',{id:this.tasks[0].id,requestId:'reassess-p1',expectedRelationRevision:this.tasks[0].relation.revision,conclusion:'maintain',reason:'The counterexample does not affect the P1 premise',nextSteps:['Continue the existing observation'],unknowns:['Business effect remains unknown']},'complete_plan'];
   if(this.firstDone&&!this.followup){this.state.followupAt??=new Date(Date.now()+5000).toISOString();return['arrange_followup',{requestId:'cognition-followup-v1',artifact:reference(this.secondJudgment),reason:'Recheck the revised judgment after P2 recovery',dependencies:['The exact P2 reassessment completes'],trigger:{kind:'at',at:this.state.followupAt}},'arrange_followup'];}
   return;
  }
  if(this.phase==='recover'&&this.recoveryTask&&!this.secondDone){
   if(last?.role!=='tool')return['record_plan_reassessment',{id:this.recoveryTask.id,requestId:'reassess-p2',expectedRelationRevision:this.recoveryTask.relation.revision,conclusion:'limit',reason:'P2 needs a narrowed applicability condition after the counterexample',nextSteps:['Publish a narrowed recommendation when evidence supports it'],unknowns:['The exact new condition is unknown']},'complete_plan'];
   this.phase='review';return;
  }
  if(this.phase==='review'&&this.followup&&!this.observed){
   if(last?.role!=='tool')return['record_followup_observation',{id:this.followup.id,requestId:'observe-cognition-v1',summary:`${this.state.counterexampleSentinel}: exact revised J2 was reread after recovery; the check records progress only.`},'observe_followup'];
   return;
  }
  if(this.phase==='revoked'&&last?.role!=='tool')return['research_context',{},'research_context'];
  return;
 }
 async *stream(options){
  const selected=this.choose(options);this.calls.push({at:new Date().toISOString(),sessionId:options.sessionId,phase:this.phase,tool:selected?.[0]??null,request:JSON.stringify(options)});
  writeFileSync(this.state.trace,JSON.stringify({at:new Date().toISOString(),sessionId:options.sessionId,phase:this.phase,tool:selected?.[0]??null})+'\n',{flag:'a',mode:0o600});
  if(selected){const[name,args,pending]=selected;this.pending.set(options.sessionId,pending);const block={type:'tool-call',id:ToolCallId(randomUUID()),name,arguments:JSON.stringify(args)};yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};return;}
  yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Synthetic engineering transport only; no operating conclusion.'}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};
 }
}

export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Official Engine/Harness/Agent/tools/Schedule plus exact cognition reassessment; local synthetic Provider/files only',checks:[],cases:[]};let host,dispose;
 const owner={enterpriseId:'cognition-reassessment-engineering',principalId:'operator'},source=mkdtempSync(join(tmpdir(),'sentiscope-cognition-')),sourceFile=resolve(source,'fact.txt'),evidenceDirectory=resolve(config.root,'source-evidence');mkdirSync(evidenceDirectory,{recursive:true,mode:0o700});
 const counterexampleFile=resolve(source,'counterexample.txt'),initial='Synthetic mechanism fact V1; no enterprise content.',updated='Synthetic authorized counterexample V2; no enterprise content.';writeFileSync(sourceFile,initial,{flag:'wx',mode:0o600});writeFileSync(resolve(evidenceDirectory,'fact-v1.txt'),initial,{flag:'wx',mode:0o600});writeFileSync(resolve(evidenceDirectory,'fact-v2.txt'),updated,{flag:'wx',mode:0o600});
 const state={sentinel:`SYNTHETIC_COGNITION_BODY_${basename(config.root)}`,counterexampleSentinel:`SYNTHETIC_COUNTEREXAMPLE_${basename(config.root)}`,independentSentinel:`SYNTHETIC_INDEPENDENT_P3_${basename(config.root)}`,originalHash:hash(initial),updatedHash:hash(updated),computeMarker:resolve(config.root,'UNEXPECTED_HOST_COMPUTE'),trace:resolve(config.root,'requests.jsonl')};
 const adapter=new Synthetic(state),grant={sourceId:'fixture',directory:source,grantRevision:1,enabled:true};
 const settings={dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider,model,maxTokens},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:300,outputTokens:300*maxTokens,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider,model,maxTokens}}};
 const http=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
 const detail=()=>host.coordinator.detail(result.delegationId);
 const idle=async()=>{await wait(()=>[...new Set(adapter.calls.map(call=>call.sessionId))].every(id=>!ctx.agents.get(id)||ctx.agents.get(id).status==='idle'),'owned native sessions idle');await pause(100);};
 try{
  dispose=ctx.llm.registerAdapter([provider],adapter);host=await startProductHost(ctx,settings,{localModelRoutes:[{provider,model}]});
  const created=await http('/api/delegations',{goal:'Synthetic evidence-driven cognition reassessment',boundary:'Only synthetic local facts; no business action, real model, enterprise data or computation.',idempotencyKey:'create'});result.delegationId=created.delegation.id;
  host.coordinator.configureSources(result.delegationId,[grant]);await host.coordinator.sync(result.delegationId);
  await wait(()=>detail().cognition?.supportRelations?.length===2,'two explicit support declarations through actual Agent tools');await idle();
  let snapshot=await http(`/api/delegations/${result.delegationId}`);assert.equal(snapshot.cognition.supportRelations.length,2);assert.ok(snapshot.cognition.supportRelations.every(relation=>relation.plan.version===1&&relation.judgment.version===1));assert.equal(snapshot.artifactRevisions.length,3);
  result.checks.push('The current main Agent publishes exact J1/P1/P2 and explicitly declares two typed support relations; ordinary references do not auto-create edges');result.cases.push({name:'explicit-support',relations:snapshot.cognition.supportRelations});

  adapter.phase='evidence';const preSourceCalls=adapter.calls.length,oldMain=adapter.mainSession,sourceChangedAt=new Date().toISOString();writeFileSync(counterexampleFile,updated,{flag:'wx',mode:0o600});
  await wait(()=>detail().cognition?.reviews?.length===1&&detail().cognition?.reevaluations?.some(task=>task.status==='completed')&&detail().cognition?.reevaluations?.some(task=>task.status==='pending')&&detail().followups?.some(record=>record.requestId==='cognition-followup-v1'&&record.schedule.status==='active'),'native recurring Schedule naturally scans source, denies the stale target, and creates review/re-evaluation/native follow-up',85000);await idle();
  const postSourceCalls=adapter.calls.slice(preSourceCalls);assert.ok(postSourceCalls.some(call=>call.sessionId!==oldMain&&call.phase==='evidence'),'A fresh qualified main session must process the source change');assert.ok(!postSourceCalls.some(call=>call.sessionId===oldMain),'The old source-epoch main session must not receive a model request after beforeWake requalification');
  snapshot=await http(`/api/delegations/${result.delegationId}`);const review=snapshot.cognition.reviews[0],tasks=snapshot.cognition.reevaluations,followup=snapshot.followups.find(record=>record.requestId==='cognition-followup-v1');
  assert.equal(review.judgment.version,1);assert.equal(review.resultJudgment.version,2);assert.equal(tasks.length,2);assert.ok(tasks.every(task=>task.plan.version===1));assert.equal(tasks.filter(task=>task.status==='completed').length,1);assert.equal(tasks.filter(task=>task.status==='pending').length,1);assert.ok(followup.schedule.id);assert.ok(snapshot.research.length>=1,'Official Engine owns research work');
  result.checks.push('The native recurring Schedule naturally scans a newly authorized counterexample; its old target is not admitted for a model request, a fresh qualified main Agent exact-reads old J1, publishes J2, records a reasoned review, closes P1, and leaves P2 independently recoverable');result.cases.push({name:'natural-source-event-review',sourceChangedAt,oldMain,newMain:adapter.mainSession,postSourceCalls:postSourceCalls.map(({request,...rest})=>rest),review,tasks,followup});

  adapter.recoveryTask=tasks.find(task=>task.status==='pending');const previousMain=adapter.mainSession;await host.close();host=undefined;adapter.phase='recover';host=await startProductHost(ctx,{...settings,grants:{[result.delegationId]:[grant]}},{localModelRoutes:[{provider,model}]});
  await wait(()=>detail().cognition?.reevaluations?.every(task=>task.status!=='pending'),'pending re-evaluation survives product Host reopen');await idle();snapshot=await http(`/api/delegations/${result.delegationId}`);
  assert.equal(snapshot.cognition.reevaluations.length,2);assert.equal(snapshot.cognition.reevaluations.filter(task=>task.status==='completed').length,2);assert.notEqual(adapter.mainSession,previousMain);assert.equal(snapshot.cognition.reviews[0].id,review.id);
  result.checks.push('Graceful Host reopen preserves exact review/support/re-evaluation identities and lets a new native generation finish only the remaining P2 responsibility');result.cases.push({name:'pending-recovery',oldMain:previousMain,newMain:adapter.mainSession});

  adapter.phase='review';const savedFollowup=detail().followups.find(record=>record.requestId==='cognition-followup-v1');await wait(()=>detail().followups?.find(record=>record.requestId==='cognition-followup-v1')?.status==='observed','official one-shot Schedule naturally resolves and the Agent records an explicit observation',15000);await idle();snapshot=await http(`/api/delegations/${result.delegationId}`);const observed=snapshot.followups.find(record=>record.requestId==='cognition-followup-v1');
  assert.equal(observed.status,'observed');assert.equal(observed.schedule.id,savedFollowup.schedule.id);assert.equal(adapter.observed.id,observed.id);assert.equal(observed.artifact.version,2);
  const nativeSchedule=await ctx.schedule.view({id:ScheduleId(observed.schedule.id)});assert.ok(nativeSchedule.lastDelivery,'The follow-up has a durable native delivery receipt');assert.equal(existsSync(state.computeMarker),false);assert.equal(snapshot.hostResources.compute.status,'unavailable');
  result.checks.push('The same follow-up is dispatched by the official native Schedule; the Agent records an explicit check against exact J2 without computation or a second timer authority');result.cases.push({name:'native-followup',observed,schedule:nativeSchedule});

  const beforeRevoked=adapter.calls.length;adapter.phase='revoked';host.coordinator.configureSources(result.delegationId,[]);await host.coordinator.sync(result.delegationId);await wait(()=>adapter.calls.length>beforeRevoked&&adapter.phase==='revoked'&&adapter.calls.slice(beforeRevoked).some(call=>call.tool==='research_context'),'revoked source produces a fresh safe Agent context');await idle();snapshot=await http(`/api/delegations/${result.delegationId}`);
  const fresh=adapter.calls.slice(beforeRevoked);assert.ok(fresh.length>0);assert.ok(fresh.every(call=>![state.sentinel,state.counterexampleSentinel,state.independentSentinel].some(sentinel=>call.request.includes(sentinel))),'Fresh model requests must not replay withdrawn support/review bodies');assert.equal(JSON.stringify(snapshot.cognition).includes(state.counterexampleSentinel),false);assert.equal(JSON.stringify(snapshot.cognition).includes(state.sentinel),false);
  result.checks.push('Source withdrawal preserves safe cognition metadata but strips old review/support bodies from current projection and every fresh native model request');result.cases.push({name:'withdrawal-safety'});

  adapter.phase='park';const current=await http(`/api/delegations/${result.delegationId}`),currentDelegation=current.delegation??current;await http(`/api/delegations/${currentDelegation.id}/commands`,{kind:'end',expectedVersion:currentDelegation.version,idempotencyKey:'end'});await wait(async()=>{const value=await http(`/api/delegations/${result.delegationId}`);return(value.delegation??value).lifecycle==='ended';},'end receipt');const endedCalls=adapter.calls.length;let lateError;try{await ctx.schedule.run({id:ScheduleId(observed.schedule.id)});}catch(error){lateError={name:error.name,message:error.message};}await pause(150);assert.equal(adapter.calls.length,endedCalls);const ended=await http(`/api/delegations/${result.delegationId}`);assert.equal((ended.delegation??ended).lifecycle,'ended');
  result.checks.push('Ending closes the delegation; a late exact native Schedule run cannot dispatch another model turn or revive cognition work');result.cases.push({name:'late-schedule-after-end',lateError,newRequests:0});
  result.detail=await http(`/api/delegations/${result.delegationId}`);result.requestCount=adapter.calls.length;result.requests=adapter.calls.map(({request,...rest})=>rest);result.status='PASS';
 }catch(error){result.error={name:error.name,code:error.code,message:error.message,stack:error.stack};if(host)try{result.debug=detail();}catch{}}
 finally{if(host)try{await host.close();}catch(error){result.status='FAIL';result.cleanupError={name:error.name,message:error.message};}if(dispose)dispose();rmSync(source,{recursive:true,force:true});}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
}
