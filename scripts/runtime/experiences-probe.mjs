import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,basename,join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {startProductHost} from 'sentiscope-runtime/plugin';
import {createRuntimeBackup,restoreRuntimeBackup,verifyRuntimeBackup} from 'sentiscope-runtime/backup';

export const name='sentiscope-experiences-engineering';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const provider='sentiscope-experiences-local',model='synthetic',maxTokens=96;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(predicate,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await pause(20);}throw Error(`Engineering check timed out: ${label}`);}
const text=message=>message?.content?.filter(block=>block.type==='text').map(block=>block.text).join('\n')??'';
const value=message=>{try{return JSON.parse(text(message));}catch{return undefined;}};
const hash=input=>createHash('sha256').update(input).digest('hex');

class Synthetic extends LlmAdapter{
 calls=[];pending=new Map();phase='origin';originSession;consumerSession;source;targetSource;counter;judgment;intake;experience;experienceRead;informed;use;rejected;revokedReadDenied;plan;relation;review;task;completed;
 constructor(state){super();this.state=state;}
 judgmentContent(){return{kind:'judgment',title:'Synthetic conditional mechanism J1',summary:`${this.state.sentinel}: mechanism supports only the declared subset`,evidence:[this.source],assumptions:['Synthetic only'],unknowns:['Business effect unknown'],applicability:'Only declared synthetic subset',invalidatedBy:['Authorized counterexample']};}
 ingest(options,data,last){
  const pending=this.pending.get(options.sessionId);this.pending.delete(options.sessionId);if(last?.role!=='tool'||!pending)return;
  if(pending==='read_source'&&data?.record)this.source={ref:data.record.ref,hash:data.record.hash};
  if(pending==='target_sources'&&data?.references){const row=data.references.find(item=>item.hash===this.source.hash);if(row)this.targetSource={ref:row.ref,hash:row.hash};}
  if(pending==='read_counter'&&data?.record)this.counter={ref:data.record.ref,hash:data.record.hash};
  if(pending==='publish_judgment'&&data?.artifactId)this.judgment={artifactId:data.artifactId,version:data.version};
  if(pending==='intake'&&data?.revision)this.intake=structuredClone(data);
  if(pending==='publish_informed'&&data?.artifactId)this.informed={artifactId:data.artifactId,version:data.version};
  if(pending==='publish_plan'&&data?.artifactId)this.plan={artifactId:data.artifactId,version:data.version};
  if(pending==='publish_experience'&&data?.id)this.experience=structuredClone(data);
  if(pending==='read_experience'&&data?.id)this.experience=structuredClone(data);
  if(pending==='read_experience'&&data?.id)this.experienceRead=true;
  if(pending==='experience_use'&&data?.id)this.use=structuredClone(data);
  if(pending==='experience_reject'&&data?.id)this.rejected=structuredClone(data);
  if(pending==='declare_support'&&data?.id)this.relation=structuredClone(data);
  if(pending==='cognition_review'&&data?.id){this.review=structuredClone(data);this.task=structuredClone(data.reevaluations[0]);}
  if(pending==='plan_reassessment'&&data?.id)this.completed=structuredClone(data);
  if(pending==='denied_read'&&last.isError)this.revokedReadDenied=true;
 }
 experienceInput(version){return{...(version.id?{id:version.id,expectedVersion:version.expectedVersion}:{}),requestId:version.requestId,title:'Conditional synthetic experience',summary:version.summary,evidence:version.evidence,basis:[{kind:'judgment',artifact:{artifactId:this.judgment.artifactId,version:1}}],businessConditions:['Only declared synthetic subset'],validUntil:'2099-01-01T00:00:00.000Z',limitations:['No causal business proof'],counterexamples:version.counterexamples,unknowns:version.unknowns,revalidateWhen:{condition:version.condition},status:version.status,reason:version.reason};}
 choose(options){
  const users=options.messages.filter(message=>message.role==='user'),latest=text(users.at(-1)),last=options.messages.at(-1),data=last?.role==='tool'?value(last):undefined,worker=users.some(message=>text(message).includes('SENTISCOPE_WORKER'));if(worker)return;
  let assessment;if(latest.startsWith('SENTISCOPE_ASSESS\n')){try{assessment=JSON.parse(latest.split('\n')[1]);}catch{}if(assessment&&last?.role!=='tool')return['decide_event',{triggerId:assessment.triggers[0].id,evalId:assessment.evalId,kind:'ignore',reason:'The synthetic fixture keeps this engineering delegation focused on the explicit experience path'},'decide_event'];}
  if(this.phase==='origin'){
   this.originSession=options.sessionId;this.ingest(options,data,last);
   if(last?.role!=='tool')return['list_sources',{},'list_sources'];
   if(!this.source&&data?.references?.length)return['read_source',{ref:data.references.at(-1).ref,hash:data.references.at(-1).hash},'read_source'];
   if(this.source&&!this.intake)return['save_intake_summary',{requestId:'intake-v1',expectedRevision:0,reason:'One-sentence goal plus authorized source completed the first bounded intake',content:{objective:'Use the synthetic mechanism only in the declared subset',facts:['Authorized source states the bounded synthetic condition'],assumptions:['Engineering fixture only'],reusableExperiences:[],researchAuthorization:['Read shared synthetic source only'],businessBoundary:['No business action or computation'],evaluation:['Engineering mechanism only'],followUp:['Watch for a counterexample'],unknowns:['No business effect'],questions:[]}},'intake'];
   if(this.source&&!this.judgment)return['publish_artifact',{expectedVersion:0,requestId:'origin-judgment-v1',reason:'Exact source supports a bounded mechanism',content:this.judgmentContent()},'publish_judgment'];
   if(this.judgment&&!this.experience)return['publish_experience',this.experienceInput({requestId:'experience-v1',summary:`${this.state.sentinel}: use only in the declared subset`,evidence:[this.source],counterexamples:[],unknowns:['Long-run stability unknown'],condition:'A new counterexample arrives',status:'active',reason:'Agent reviewed exact source and J1'}),'publish_experience'];
   return;
  }
  if(this.phase==='consumer'){
   this.consumerSession=options.sessionId;this.ingest(options,data,last);
   if(last?.role!=='tool')return['find_experiences',{},'find_experiences'];
   if(this.experience?.id&&!this.experienceRead)return['read_experience',{id:this.experience.id,version:this.experience.version},'read_experience'];
   if(this.experienceRead&&!this.targetSource)return['list_sources',{},'target_sources'];
   if(this.targetSource&&!this.informed)return['publish_artifact',{expectedVersion:0,requestId:'consumer-judgment-v1',reason:'Applicable experience narrowed verification first',content:{...this.judgmentContent(),title:'Consumer informed J2',summary:`${this.state.consumerSentinel}: experience narrowed the verification direction`,evidence:[this.targetSource]}},'publish_informed'];
   if(this.informed&&!this.use)return['record_experience_use',{requestId:'experience-use',experience:{id:this.experience.id,version:this.experience.version},decision:'applied',reason:'Target scope matches the declared subset',influence:'Prioritized the mechanism precondition and excluded an unrelated path',artifact:this.informed},'experience_use'];
   if(this.use&&!this.rejected)return['record_experience_use',{requestId:'experience-reject',experience:{id:this.experience.id,version:this.experience.version},decision:'not_applied',reason:'An unrelated target does not match',influence:'Avoided broad reuse'},'experience_reject'];
   return;
  }
  if(this.phase==='revoked'){
   this.ingest(options,data,last);
   if(!this.revokedReadDenied)return['read_experience',{id:this.experience.id,version:this.experience.version},'denied_read'];
   return;
  }
  if(this.phase==='revision'){
   this.ingest(options,data,last);if(latest.includes('Synthetic experience consumer'))return;
   if(last?.role!=='tool')return['research_context',{},'research_context'];
   if(!this.counter&&data?.references?.length){const row=data.references.find(item=>item.hash!==this.source.hash);if(row)return['read_source',{ref:row.ref,hash:row.hash},'read_counter'];}
   if(this.counter&&(!this.experience||this.experience.version===1))return['publish_experience',this.experienceInput({id:this.experience.id,expectedVersion:1,requestId:'experience-v2',summary:`${this.state.counterSentinel}: counterexample limits the mechanism`,evidence:[this.source,this.counter],counterexamples:[this.counter],unknowns:['Exact unaffected boundary unknown'],condition:'After dependent reassessment',status:'limited',reason:'Authorized counterexample limits applicability'}),'publish_experience'];
   if(this.experience?.version===2&&!this.plan)return['publish_artifact',{expectedVersion:0,requestId:'dependent-plan-v1',reason:'Dependent recommendation',content:{kind:'plan',title:'Dependent synthetic plan P1',summary:`${this.state.sentinel}: dependent recommendation`,evidence:[this.source],assumptions:[],unknowns:['Operating effect unknown'],applicability:'Only declared subset',invalidatedBy:['Counterexample'],recommendation:'Use only the subset',alternatives:[{option:'Wait',costs:'Unknown',risks:'Unknown'}],constraints:['No operating action'],observation:{baseline:'Synthetic',expectedChange:'Unknown',measure:'Synthetic',window:'Later',source:'Synthetic',check:'Recheck'}}},'publish_plan'];
   if(this.plan&&!this.relation)return['declare_support_dependency',{requestId:'support',judgment:this.judgment,plan:this.plan,scope:'Only declared subset',why:'P1 depends on J1',reason:'Agent declared direct support'},'declare_support'];
   if(this.relation&&!this.review)return['record_cognition_review',{requestId:'experience-review',judgment:this.judgment,trigger:{kind:'experience',id:this.experience.id,version:2},conclusion:'limited',summary:`${this.state.counterSentinel}: experience limits J1`,reason:'Only the dependent recommendation needs reassessment',changes:['J1 applicability narrowed'],limitations:['Synthetic only'],unknowns:[],nextReview:{condition:'After P1 reassessment'}},'cognition_review'];
   if(this.task&&!this.completed)return['record_plan_reassessment',{id:this.task.id,requestId:'plan-reassessment',expectedRelationRevision:this.task.relation.revision,conclusion:'limit',reason:'Experience counterexample narrows P1',nextSteps:['Publish narrowed recommendation'],unknowns:['Exact boundary unknown']},'plan_reassessment'];
   return;
  }
 }
 async *stream(options){
  let selected;try{selected=this.choose(options);}catch(error){this.state.chooseError={name:error.name,message:error.message,stack:error.stack};throw error;}this.calls.push({at:new Date().toISOString(),sessionId:options.sessionId,phase:this.phase,tool:selected?.[0]??null,request:JSON.stringify(options)});
  if(selected){const[name,args,pending]=selected;this.pending.set(options.sessionId,pending);const block={type:'tool-call',id:ToolCallId(randomUUID()),name,arguments:JSON.stringify(args)};yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'block-end',index:0,block};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'tool-calls'}};return;}
  yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Synthetic engineering transport only; no research-quality claim.'}};yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};
 }
}

export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Official Engine/Harness/Agent/tools plus conditional reusable experiences across two same-enterprise delegations; local synthetic Provider/files only',checks:[],cases:[]};let host,dispose;
 const owner={enterpriseId:'experience-engineering-enterprise',principalId:'operator'},source=mkdtempSync(join(tmpdir(),'sentiscope-experience-')),fact=resolve(source,'fact.txt'),initial='Synthetic experience fact V1';writeFileSync(fact,initial,{flag:'wx',mode:0o600});
 const state={sentinel:`SYNTHETIC_EXPERIENCE_${basename(config.root)}`,consumerSentinel:`SYNTHETIC_EXPERIENCE_USE_${basename(config.root)}`,counterSentinel:`SYNTHETIC_EXPERIENCE_COUNTER_${basename(config.root)}`,trace:resolve(config.root,'requests.jsonl')};
 const adapter=new Synthetic(state),grant={sourceId:'shared',directory:source,grantRevision:1,enabled:true};
 const settings={dataDirectory:resolve(config.root,'data'),owner,port:0,model:{provider,model,maxTokens},intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},resourceDefaults:{budget:{limits:{modelRequests:400,outputTokens:400*maxTokens,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider,model,maxTokens}}};
 const http=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
 const detail=id=>host.coordinator.detail(id);const idle=async()=>{await wait(()=>[...new Set(adapter.calls.map(call=>call.sessionId))].every(id=>!ctx.agents.get(id)||ctx.agents.get(id).status==='idle'),'sessions idle');await pause(100);};
 try{
  dispose=ctx.llm.registerAdapter([provider],adapter);host=await startProductHost(ctx,settings,{localModelRoutes:[{provider,model}]});
  const originCreated=await http('/api/delegations',{goal:'Synthetic experience origin',boundary:'Synthetic local source only; no business action or computation.',idempotencyKey:'origin'}),origin=originCreated.delegation.id;result.originId=origin;
  host.coordinator.configureSources(origin,[grant]);await host.coordinator.sync(origin);
  await wait(()=>detail(origin).intake?.summary?.revision===1&&detail(origin).experiences?.experiences?.length===1,'origin Agent completes one-sentence intake and forms one exact conditional experience');await idle();
  adapter.phase='consumer';const consumerCreated=await http('/api/delegations',{goal:'Synthetic experience consumer',boundary:'Synthetic local source only; no business action or computation.',idempotencyKey:'consumer'}),consumer=consumerCreated.delegation.id;result.consumerId=consumer;host.coordinator.configureSources(consumer,[grant]);await host.coordinator.sync(consumer);
  await wait(()=>detail(consumer).experiences?.uses?.length===2,'consumer Agent actually applies and rejects the same exact experience');await idle();
  const firstOrigin=await http(`/api/delegations/${origin}`),firstConsumer=await http(`/api/delegations/${consumer}`);assert.equal(firstOrigin.intake.summary.content.objective,'Use the synthetic mechanism only in the declared subset');assert.equal(firstOrigin.experiences.experiences[0].qualification,'current');assert.equal(firstConsumer.experiences.uses.length,2);assert.equal(adapter.informed.version,1);
  result.checks.push('A one-sentence delegation plus authorized source produces a revisioned intake summary; two same-enterprise delegations use normal official Agent tools to form an exact conditional experience, read it cross-delegation, record an actual applied influence, and retain a reasoned rejection');result.cases.push({name:'intake-formation-and-use',origin,consumer,intake:firstOrigin.intake.summary,experience:firstOrigin.experiences.experiences[0],uses:firstConsumer.experiences.uses});

  host.coordinator.configureSources(origin,[]);await host.coordinator.sync(origin);adapter.phase='revoked';
  for(let attempt=0;attempt<3&&!adapter.revokedReadDenied;attempt++){
   const revokedBefore=await http(`/api/delegations/${consumer}`);await http(`/api/delegations/${consumer}/commands`,{kind:'message',expectedVersion:revokedBefore.delegation.version,idempotencyKey:`experience-revoked-wake-${attempt}`,text:'Recheck the exact experience after source withdrawal.'});
   try{await wait(()=>adapter.revokedReadDenied,'origin source withdrawal denies exact cross-delegation body read',4000);}catch{/* Retain the failed attempt and use another normal user message. */}
  }
  assert.equal(adapter.revokedReadDenied,true,'exact cross-delegation body read must be denied after origin withdrawal');await idle();
  const shielded=detail(consumer);assert.equal(shielded.experiences.experiences[0].qualification,'unavailable');assert.equal(JSON.stringify(shielded.experiences).includes(state.sentinel),false);assert.equal(JSON.stringify(shielded.experiences).includes(state.consumerSentinel),false);
  result.checks.push('Origin-source withdrawal hides experience and use bodies from target browser/model projection and rejects the exact Agent read while retaining safe metadata');result.cases.push({name:'origin-withdrawal'});

  host.coordinator.configureSources(origin,[{...grant,grantRevision:3,enabled:true}]);writeFileSync(resolve(source,'counter.txt'),`Synthetic counterexample ${randomUUID()}`,{flag:'wx',mode:0o600});await host.coordinator.sync(origin);await host.coordinator.sync(consumer);
  await host.close();host=undefined;adapter.phase='revision';host=await startProductHost(ctx,{...settings,grants:{[origin]:[{...grant,grantRevision:3,enabled:true}],[consumer]:[grant]}},{localModelRoutes:[{provider,model}]});
  await wait(()=>detail(origin).experiences?.experiences?.some(item=>item.version===2&&item.status==='limited')&&detail(origin).cognition?.reevaluations?.some(item=>item.status==='completed')&&detail(origin).experiences?.uses?.length===2,'reopen origin Agent revises experience and closes dependent recommendation reassessment');await idle();
  const finalOrigin=await http(`/api/delegations/${origin}`),experience=finalOrigin.experiences.experiences.find(item=>item.version===2),tasks=finalOrigin.cognition.reevaluations;assert.equal(experience.status,'limited');assert.equal(tasks.length,1);assert.equal(tasks[0].status,'completed');assert.equal(adapter.completed.id,tasks[0].id);assert.equal(finalOrigin.experiences.uses.length,2);
  result.checks.push('After Host reopen and a new authorized counterexample, the origin Agent limits the exact experience, triggers a cognition review, and narrows only the declared dependent recommendation');result.cases.push({name:'counterexample-revision',experience,tasks});

  const endAt=new Date(Date.now()+3000).toISOString();await http(`/api/delegations/${origin}/commands`,{kind:'research_control',expectedVersion:0,action:'schedule_end',at:endAt,reason:'Synthetic validity ends after the full experience path',idempotencyKey:'completion-end'});
  await wait(async()=>(await http(`/api/delegations/${origin}`)).delegation.lifecycle==='ended','native scheduled end naturally closes the completed origin delegation',12000);
  result.checks.push('A persisted native lifecycle Schedule naturally ends the origin delegation after the experience path; no manual schedule execution is used');result.cases.push({name:'scheduled-end',at:endAt});

  await host.close();host=undefined;
  const backupDirectory=resolve(config.root,'backup-data'),restoredDirectory=resolve(config.root,'restored-data'),backup=await createRuntimeBackup(resolve(config.root,'data'),backupDirectory),verification=await verifyRuntimeBackup(backupDirectory);assert.equal(verification.status,'ok');await restoreRuntimeBackup(backupDirectory,restoredDirectory);
  host=await startProductHost(ctx,{...settings,dataDirectory:restoredDirectory,grants:{[origin]:[{...grant,grantRevision:3,enabled:true}],[consumer]:[grant]}},{localModelRoutes:[{provider,model}]});
  const recovered=await http(`/api/delegations/${origin}`);assert.equal(recovered.delegation.lifecycle,'ended');assert.equal(recovered.experiences.experiences.find(item=>item.version===2).status,'limited');assert.equal(recovered.cognition.reevaluations[0].status,'completed');
  result.checks.push('The closed runtime backup verifies, restores, and restarts with the exact ended lifecycle, immutable experience v2, and completed dependent reassessment');result.cases.push({name:'runtime-backup-recovery',backup,verification,recovered:{lifecycle:recovered.delegation.lifecycle,experienceVersion:2,reevaluationStatus:recovered.cognition.reevaluations[0].status}});
  result.detail={origin:finalOrigin,consumer:await http(`/api/delegations/${consumer}`)};result.requestCount=adapter.calls.length;result.requests=adapter.calls.map(({request,...rest})=>rest);result.status='PASS';
 }catch(error){result.error={name:error.name,code:error.code,message:error.message,stack:error.stack};result.chooseError=state.chooseError;if(host)try{result.debug={origin:host.coordinator.detail(result.originId),consumer:host.coordinator.detail(result.consumerId)};}catch{}}
 finally{if(host)try{await host.close();}catch(error){result.status='FAIL';result.cleanupError={name:error.name,message:error.message};}if(dispose)dispose();rmSync(source,{recursive:true,force:true});}
 writeFileSync(config.output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
}
