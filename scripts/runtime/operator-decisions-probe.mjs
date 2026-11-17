import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,basename,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
import {ScheduleId} from '@deepseek-ai/dsh-schedule';
import {startProductHost} from 'sentiscope-runtime/plugin';

export const name='sentiscope-operator-decisions-engineering';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const provider='sentiscope-operator-decisions-local',model='synthetic',maxTokens=64;
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function wait(predicate,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await pause(20);}throw Error(`Engineering check timed out: ${label}`);}
const text=message=>message?.content?.filter(block=>block.type==='text').map(block=>block.text).join('\n')??'';
const value=message=>{try{return JSON.parse(text(message));}catch{return undefined;}};
const hash=value=>createHash('sha256').update(value).digest('hex');
const ref=revision=>({artifactId:revision.artifactId,version:revision.version});

/** Scripted local transport proves mechanisms only; it is never a product reasoning policy. */
class Synthetic extends LlmAdapter{
 calls=[];pending=new Map();phase='setup';ticketId=undefined;mainSession=undefined;evidence=undefined;computeChecked=false;ackRead=false;partialRead=false;revokedReadDenied=false;
 constructor(state){super();this.state=state;}
 plan(version){return{kind:'plan',title:`Synthetic operating proposal v${version}`,summary:`${this.state.sentinel}: bounded proposal revision ${version}`,evidence:[this.evidence],assumptions:['Only this synthetic fixture is represented'],unknowns:['Business outcome and real model understanding remain unverified'],applicability:'Only this isolated synthetic delegation',invalidatedBy:['Goal, source qualification or contrary evidence changes'],recommendation:'Consider only scope A; scope B is excluded',alternatives:[{option:'Keep the current position',costs:'Unknown',risks:'The issue can remain unresolved'}],constraints:['No enterprise action or new resource authority'],observation:{baseline:'Unknown; no enterprise material',expectedChange:'Unknown',measure:'Synthetic exact-source check',window:'A future authorized observation',source:'Synthetic fixture source',check:'Continue independent research'}};}
 decision(artifact){const now=Date.now();return{expectedRevision:0,requestId:'propose-once',artifact:ref(artifact),title:'Choose whether to adopt only scope A',question:`${this.state.decisionSentinel}: which explicit scope should be adopted?`,options:[{id:'scope-a',label:'Scope A only',scope:'Only A; exclude B',costs:'Unknown',risks:'Further evidence can narrow applicability'}],recommendation:{optionId:'scope-a',reason:'The fixture contains limited evidence for A'},unknowns:['No operating effect is established'],nondecisionImpact:'Only dependent operating recommendations wait; independent research continues',nextActions:['Continue independent evidence checks','Recheck applicability before a late choice'],window:{remindAt:new Date(now+60000).toISOString(),decideBy:new Date(now+120000).toISOString(),executeBy:new Date(now+180000).toISOString(),basis:'Synthetic future timing fixture, not a real business deadline',nextReviewAt:new Date(now+90000).toISOString()},reason:'This scope choice belongs to the operator'};}
 ingest(options,last,data){const pending=this.pending.get(options.sessionId);if(last?.role!=='tool'||!pending)return;this.pending.delete(options.sessionId);
  if(pending==='read_source'&&data?.record)this.evidence={ref:data.record.ref,hash:data.record.hash};
  if(pending==='decide_event'&&data?.decision?.ticketId)this.ticketId=data.decision.ticketId;
  if(pending==='run_compute'){assert.equal(data?.code,'compute_unavailable');assert.equal(data?.dispatched,false);this.computeChecked=true;}
  if(pending==='ack-read'){assert.equal(data?.status,'pending');assert.equal(data?.choices?.length,0);assert.ok(data?.seenAt);this.ackRead=true;}
  if(pending==='partial-read'){assert.ok(data?.responses?.some(r=>r.action==='reply'&&r.text===this.state.replyText));this.partialRead=true;}
  if(pending==='revoked-read'){assert.equal(last.isError,true);assert.equal(data?.question,undefined);this.revokedReadDenied=true;}
 }
 choose(options){const users=options.messages.filter(m=>m.role==='user'),last=options.messages.at(-1),data=last?.role==='tool'?value(last):undefined,latest=text(users.at(-1));
  if(users.some(m=>text(m).includes('SENTISCOPE_WORKER')))return;
  this.mainSession=options.sessionId;this.ingest(options,last,data);
  if(this.phase==='setup'||this.phase==='park')return;
  if(this.phase==='revoked'){if(!this.revokedReadDenied)return['read_decision',{id:this.state.decision.id,revision:this.state.decision.revision},'revoked-read'];return;}
  let candidate=data?.candidates?.find(c=>c.triggers?.length);if(!candidate&&latest.startsWith('SENTISCOPE_ASSESS\n'))try{candidate=JSON.parse(latest.split('\n')[1]);}catch{}
  const pendingEval=candidate?.triggers?.[0];
  // Consult the actual candidate context on each new input. The Engine owns all evaluation identities.
  if(pendingEval&&candidate.evalId&&!this.state.decidedEvals.has(candidate.evalId)){
   this.state.decidedEvals.add(candidate.evalId);
   return['decide_event',{triggerId:pendingEval.id,evalId:candidate.evalId,kind:this.ticketId?'ignore':'accept',reason:'Existing research retains the operating question; a human response is not another operating permission',...(this.ticketId?{}:{title:'Synthetic scope decision research',scope:'Only the authorized synthetic fixture'})}];
  }
  const detail=this.state.detail();
  if(!this.ticketId){if(last?.role!=='tool')return['research_context',{}];return;}
  if(!this.computeChecked)return['run_compute',{command:[process.execPath,'-e',`require('node:fs').writeFileSync(${JSON.stringify(this.state.computeMarker)},'UNEXPECTED')`],timeoutMs:100,inputRefs:[]}];
  const currentPlan=detail.artifactRevisions?.find(r=>r.kind==='plan'&&r.version===1&&r.qualification==='current');
  if(!currentPlan){const source=detail.sourceReferences?.find(r=>r.hash===this.state.sourceHash);if(!source)return['list_sources',{}];if(this.evidence?.hash!==source.hash)return['read_source',{ref:source.ref,hash:source.hash}];return['publish_artifact',{expectedVersion:0,requestId:'proposal-v1',reason:'Initial bounded synthetic proposal',content:this.plan(1)}];}
  const item=detail.decisions?.find(d=>d.artifact.artifactId===currentPlan.artifactId&&d.artifact.version===1);
  if(!item)return['propose_decision',this.decision(currentPlan)];this.state.decision=item;this.state.artifact=currentPlan;
  if(this.phase==='ack'&&!this.ackRead)return['read_decision',{id:item.id,revision:item.revision},'ack-read'];
  if(this.phase==='independent'&&!detail.artifactRevisions?.some(r=>r.kind==='judgment'))return['publish_artifact',{expectedVersion:0,requestId:'independent-judgment',reason:'The operator has not chosen; this finding does not depend on that choice',content:{kind:'judgment',title:'Independent synthetic finding',summary:'Pending choice did not stop independent research',evidence:[this.evidence],assumptions:[],unknowns:['No business effect'],applicability:'Independent synthetic evidence only',invalidatedBy:['Source qualification changes']}}];
  if(this.phase==='reply'){
   if(!this.partialRead)return['read_decision',{id:item.id,revision:item.revision},'partial-read'];
   const response=data?.responses?.find(r=>r.action==='reply'&&!r.interpretation);
   if(response)return['interpret_operator_response',{responseId:response.responseId,requestId:'interpret-partial-once',action:'partial',optionId:'scope-a',scope:'First item in A only; exclude the rest of A and all B',reason:'The stored human sentence explicitly narrows the adopted scope'}];
  }
  if(this.phase==='revise'){
   const second=detail.artifactRevisions?.find(r=>r.kind==='plan'&&r.version===2);
   if(!second)return['publish_artifact',{artifactId:currentPlan.artifactId,expectedVersion:1,requestId:'proposal-v2',reason:'A further independent review changes the proposed version; no old choice migrates',content:this.plan(2)}];
   if(!detail.decisions?.some(d=>d.id===item.id&&d.revision===2))return['propose_decision',{...this.decision(second),id:item.id,expectedRevision:1,requestId:'decision-v2',reason:'Accurate proposal v2 requires a fresh explicit operating choice'}];
  }
  if(last?.role!=='tool')return['research_context',{}];
 }
 async *stream(options){const selected=this.choose(options);const entry={at:new Date().toISOString(),sessionId:options.sessionId,phase:this.phase,tool:selected?.[0]??null};this.calls.push({...entry,request:JSON.stringify(options)});writeFileSync(this.state.trace,JSON.stringify(entry)+'\n',{flag:'a',mode:0o600});
  if(selected){const[name,args,pending]=selected;this.pending.set(options.sessionId,pending??name);const block={type:'tool-call',id:ToolCallId(randomUUID()),name,arguments:JSON.stringify(args)};yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};return;}
  yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Local synthetic mechanism check only.'}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};
 }
}

export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Actual official Engine/Harness Agent/Session/Schedule plus exact operating choices; explicit local synthetic Provider/files only',checks:[],cases:[]};
 let host,dispose,fixtureSchedule;const owner={enterpriseId:'operator-decisions-engineering',principalId:'operator'};
 const source=mkdtempSync(join(tmpdir(),'sentiscope-operator-decisions-')),sourceFile=resolve(source,'fact.txt'),original='Synthetic authorized scope evidence; no enterprise content.';
 writeFileSync(sourceFile,original,{flag:'wx',mode:0o600});mkdirSync(resolve(config.root,'source-evidence'),{recursive:true,mode:0o700});writeFileSync(resolve(config.root,'source-evidence/fact.txt'),original,{flag:'wx',mode:0o600});
 const state={sourceHash:hash(original),sentinel:`SYNTHETIC-PLAN-BODY-${basename(config.root)}`,decisionSentinel:`SYNTHETIC-DECISION-BODY-${basename(config.root)}`,replyText:'Adopt only the first item in A; do not adopt the rest of A or any B.',computeMarker:resolve(config.root,'UNEXPECTED_HOST_COMPUTE'),trace:resolve(config.root,'requests.jsonl'),decidedEvals:new Set(),detail:()=>host.coordinator.detail(result.delegationId)};
 const adapter=new Synthetic(state),grant={sourceId:'fixture',directory:source,grantRevision:1,enabled:true};
 const settings={dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider,model,maxTokens},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:300,outputTokens:300*maxTokens,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider,model,maxTokens}}};
 const request=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return{response,value:await response.json()};};
 const http=async(path,body)=>{const r=await request(path,body);assert.ok(r.response.ok,JSON.stringify(r.value));return r.value;};
 const detail=()=>host.coordinator.detail(result.delegationId),path=()=>`/api/delegations/${result.delegationId}`;
 const idle=async()=>{await wait(()=>[...new Set(adapter.calls.map(c=>c.sessionId))].every(id=>!ctx.agents.get(id)||ctx.agents.get(id).status==='idle'),'owned native sessions idle');await pause(100);};
 const wake=async(label)=>{fixtureSchedule=await ctx.schedule.create({title:`Synthetic ${label}`,prompt:`SENTISCOPE_CONTINUE: synthetic ${label} mechanism check`,timing:{kind:'after',after_seconds:1},target:{kind:'session',sessionId:SessionId(adapter.mainSession)}},SessionId(adapter.mainSession));};
 const closeFixture=async()=>{if(!fixtureSchedule)return;const row=await ctx.schedule.edit({id:ScheduleId(fixtureSchedule.id),action:'update',patch:{active:false}},SessionId(fixtureSchedule.target.sessionId));assert.ok(row.status==='paused'||row.status==='ended');result.cases.push({name:'fixture-native-task-closed',id:row.id,status:row.status});fixtureSchedule=undefined;};
 try{
  dispose=ctx.llm.registerAdapter([provider],adapter);host=await startProductHost(ctx,settings,{localModelRoutes:[{provider,model}]});
  const created=await http('/api/delegations',{goal:'Synthetic continuous research with an exact scoped operating choice',boundary:'Only synthetic authorized files; no real model, enterprise action or compute',idempotencyKey:'create'});result.delegationId=created.delegation.id;
  adapter.phase='propose';host.coordinator.configureSources(result.delegationId,[grant]);await host.coordinator.sync(result.delegationId);
  await wait(()=>detail().decisions?.length===1,'actual Agent proposal and exact pending decision');await idle();
  const initial=detail().decisions[0];state.decision=initial;assert.equal(initial.status,'pending');assert.equal(initial.artifact.version,1);assert.equal(detail().research.length>=1,true);assert.equal(detail().hostResources.compute.status,'unavailable');assert.equal(adapter.computeChecked,true);assert.equal(existsSync(state.computeMarker),false);
  result.checks.push('Actual official Engine ticket and native tool calls save a complete exact-source proposal v1 plus its scoped decision and distinct justified time fields; compute is denied');
  adapter.phase='ack';const ackBody={kind:'decision_response',id:initial.id,revision:initial.revision,artifact:initial.artifact,requestId:'ack-once',action:'acknowledge',text:'Acknowledged; I have not chosen.'};await http(`${path()}/commands`,ackBody);
  await wait(()=>adapter.ackRead,'Agent reads the actual persisted acknowledgment');await idle();let snapshot=await http(path());assert.equal(snapshot.decisions[0].status,'pending');assert.equal(snapshot.operatorChoices.length,0);assert.equal(snapshot.decisions[0].seenAt!==undefined,true);
  result.checks.push('Host HTTP acknowledgment is read by the actual native Agent; seen remains pending and creates zero operating choices');
  adapter.phase='independent';const before=adapter.calls.length;await wake('independent research with no operator choice');
  await wait(()=>detail().artifactRevisions?.some(r=>r.kind==='judgment'),'native scheduled independent research while no choice exists');await idle();const nativeDue=await ctx.schedule.view({id:ScheduleId(fixtureSchedule.id)});assert.ok(nativeDue.lastDelivery);assert.ok(adapter.calls.length>before);assert.equal(detail().operatorChoices.length,0);assert.equal(detail().decisions[0].status,'pending');await closeFixture();
  result.checks.push('A real native one-shot wake continues independent research and publishes a separate judgment while the operating decision remains unanswered');
  adapter.phase='reply';const replyBody={kind:'decision_response',id:initial.id,revision:initial.revision,artifact:initial.artifact,requestId:'partial-reply-once',action:'reply',text:state.replyText};await http(`${path()}/commands`,replyBody);
  await wait(()=>detail().operatorChoices?.length===1,'Agent interprets stored partial adoption after exact read');await idle();snapshot=await http(path());const choice=snapshot.operatorChoices[0];assert.equal(choice.action,'partial');assert.equal(choice.scope,'First item in A only; exclude the rest of A and all B');assert.deepEqual(choice.artifact,initial.artifact);assert.deepEqual(choice.actor,owner);assert.equal(choice.text,state.replyText);assert.equal(choice.source,'interpreted');assert.equal(snapshot.outcomes.length,0);assert.equal(adapter.partialRead,true);
  const count=snapshot.decisionResponses.length;await http(`${path()}/commands`,replyBody);await idle();assert.equal(detail().decisionResponses.length,count);assert.equal(detail().operatorChoices.length,1);
  result.checks.push('The native Agent reads a Host-saved human sentence and records only its explicit partial scope against exact v1; duplicate HTTP request is idempotent and adoption creates no execution fact');
  adapter.phase='revise';await wake('proposal revision');await wait(()=>detail().decisions?.some(d=>d.id===initial.id&&d.revision===2),'proposal and decision revision two');await idle();await closeFixture();
  const stale=await request(`${path()}/commands`,{...ackBody,requestId:'stale-adopt',action:'adopt',optionId:'scope-a',scope:'Only A; exclude B',text:'Must not move the v1 choice to v2'});assert.equal(stale.response.status,409);snapshot=await http(path());assert.equal(snapshot.operatorChoices.length,1);assert.equal(snapshot.operatorChoices[0].artifact.version,1);assert.equal(snapshot.decisions[0].qualification,'historical');
  result.checks.push('A new proposal v2 preserves the exact v1 choice, makes the old decision historical, and rejects a stale-page adoption instead of silently migrating it');
  state.decision=snapshot.decisions.find(d=>d.id===initial.id&&d.revision===2);assert.equal(state.decision.qualification,'current');assert.equal(state.decision.choices.length,0);
  adapter.phase='park';const saved=JSON.stringify(snapshot.operatorChoices),oldSession=adapter.mainSession;await host.close();host=undefined;host=await startProductHost(ctx,{...settings,grants:{[result.delegationId]:[grant]}},{localModelRoutes:[{provider,model}]});snapshot=await http(path());assert.equal(JSON.stringify(snapshot.operatorChoices),saved);assert.equal(snapshot.decisionResponses.length,count);assert.equal(snapshot.operatorChoices[0].responseId,choice.responseId);
  result.checks.push('Graceful product Host reopen preserves immutable human response and exact-version choice identities; this does not claim OS crash or backup recovery');result.cases.push({name:'host-reopen',oldSession,newSession:adapter.mainSession});
  const beforeRevoked=adapter.calls.length;adapter.phase='revoked';host.coordinator.configureSources(result.delegationId,[]);await host.coordinator.sync(result.delegationId);await wait(()=>adapter.revokedReadDenied,'revoked decision body rejected');await idle();assert.ok(adapter.calls.slice(beforeRevoked).length>0);assert.ok(adapter.calls.slice(beforeRevoked).every(c=>!c.request.includes(state.sentinel)&&!c.request.includes(state.decisionSentinel)),'Withdrawn derived decision bodies must not enter fresh model requests');
  result.checks.push('Withdrawal preserves historical operating facts while an actual native tool rejects the old decision body and fresh model requests do not replay its derived proposal content');
  adapter.phase='park';snapshot=await http(path());await http(`${path()}/commands`,{kind:'end',expectedVersion:snapshot.delegation.version,idempotencyKey:'end-once'});await wait(async()=>(await http(path())).delegation.lifecycle==='ended','end receipt');assert.equal(existsSync(state.computeMarker),false);result.detail=await http(path());result.requestCount=adapter.calls.length;result.requests=adapter.calls.map(({request,...rest})=>rest);result.status='PASS';
 }catch(error){result.error={name:error.name,code:error.code,message:error.message,stack:error.stack};if(host)try{result.debug=detail();}catch{}}
 finally{try{await closeFixture();}catch(error){result.status='FAIL';result.fixtureCleanupError={name:error.name,message:error.message};}if(host)try{await host.close();}catch(error){result.status='FAIL';result.cleanupError={name:error.name,message:error.message};}if(dispose)dispose();rmSync(source,{recursive:true,force:true});}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
}
