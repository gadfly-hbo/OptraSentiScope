import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import type {ArtifactEvidence,ArtifactReference} from '../src/artifacts.ts';
import {DecisionStore} from '../src/decisions.ts';
import {OutcomeStore} from '../src/outcomes.ts';
import type {SaveExecution,SaveObservation} from '../src/outcomes.ts';
import type {RunBinding} from '../runtime/index.ts';
const owner={enterpriseId:'outcomes-fixture',principalId:'operator'};
const plan={kind:'plan' as const,title:'Synthetic plan',summary:'No real business claim',evidence:[],assumptions:[],unknowns:['Engineering fixture only'],applicability:'Synthetic only',invalidatedBy:['Changed facts'],recommendation:'Observe bounded part A',alternatives:[{option:'Observe A',costs:'Unknown',risks:'Unknown'}],constraints:['No business execution'],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic only',window:'Bounded observation',source:'Authorized fixture',check:'Recheck'}};
const evidence={ref:'synthetic-source-ref',hash:'a'.repeat(64)};
async function fixture(filename=':memory:'){
 const store=new SentiStore({filename}),d=store.create(owner,{goal:'Synthetic result tracking',idempotencyKey:'create'});
 let now='2026-11-17T12:00:00.000Z',epoch=0,current=true,evidenceCurrent=true;
 let verifier:((refs:readonly ArtifactEvidence[])=>Promise<void>)|undefined;
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main'};
 const artifacts=new ArtifactStore(store,{owner,delegationId:d.id},{isCurrent:()=>current,verifyEvidence:async()=>{}});
 const artifact=await artifacts.save(binding,{expectedVersion:0,requestId:'plan',reason:'Synthetic only',content:plan});
 const decisions=new DecisionStore(store,{owner,delegationId:d.id},{isCurrent:()=>current,currentEpoch:()=>epoch,isArtifactCurrent:(r,q)=>artifacts.isCurrentBusinessReference(r,q),verifyArtifact:(b,r)=>artifacts.read(b,r),now:()=>now});
 const decision=await decisions.save(binding,{expectedRevision:0,requestId:'decision',artifact:{artifactId:artifact.artifactId,version:1},title:'Bounded synthetic choice',question:'Observe only A?',options:[{id:'a',label:'Observe A',scope:'Only part A',costs:'Unknown',risks:'Unknown'}],recommendation:{optionId:'a',reason:'Limited fixture'},unknowns:['No real effect'],nondecisionImpact:'Independent research continues',nextActions:['Continue research'],window:{basis:'Synthetic engineering window',nextReviewAt:'2026-11-17T13:00:00.000Z'},reason:'Needs an explicit operating choice'});
 decisions.respond({id:decision.id,revision:1,artifact:decision.artifact,requestId:'choice',action:'partial',optionId:'a',scope:'Only part A1',text:'Select only A1; no execution claim.'});
 const choice=decisions.choices()[0];
 const eligible=(ref:ArtifactReference,q:{goalRevision:number;epoch:number})=>artifacts.history().some(a=>a.artifactId===ref.artifactId&&a.version===ref.version&&a.kind==='plan'&&a.goalRevision===q.goalRevision);
 const outcomes=new OutcomeStore(store,{owner,delegationId:d.id},{isCurrent:()=>current,currentEpoch:()=>epoch,isArtifactEligible:eligible,verifyArtifact:(b,r)=>artifacts.readForOutcome(b,r),getChoice:id=>decisions.choices().find(c=>c.id===id),verifyEvidence:async(_b,refs)=>{if(verifier)await verifier(refs);if(!evidenceCurrent||refs.some(r=>r.ref!==evidence.ref||r.hash!==evidence.hash))throw Error('SENSITIVE_SYNTHETIC_SOURCE_DIAGNOSTIC');},now:()=>now});
 const input:SaveExecution={expectedRevision:0,requestId:'execution',artifact:decision.artifact,choiceId:choice.id,scope:'Only part A1 item 1',status:'partial',asOf:'2026-11-17T11:00:00Z',startedAt:'2026-11-17T10:00:00Z',extent:'One item of A1 observed; remainder unknown',evidence:[evidence],statementIds:[],unknowns:['No effect attribution'],reason:'Authorized evidence records partial execution'};
 const observation=(execution:{id:string;revision:number}):SaveObservation=>({expectedRevision:0,requestId:'observation',artifact:decision.artifact,choiceId:choice.id,execution,scope:'Only the executed item',period:{from:'2026-11-17T10:00:00Z',to:'2026-11-17T11:00:00Z'},observedAt:'2026-11-17T11:30:00Z',maturity:'immature',baseline:'Synthetic prior observation',measure:'Synthetic comparable phenomenon',result:'Limited apparent improvement; not yet mature',comparability:'Same fixture scope; no attribution claim',gaps:['Observation window incomplete'],evidence:[evidence],statementIds:[],unknowns:['External causes not assessed'],reason:'Keep actual observation distinct from business effect'});
 return{store,d,binding,artifacts,artifact,decisions,decision,choice,outcomes,input,observation,setNow:(v:string)=>{now=v;},setEpoch:(v:number)=>{epoch=v;},setCurrent:(v:boolean)=>{current=v;},setEvidenceCurrent:(v:boolean)=>{evidenceCurrent=v;},setVerifier:(v:typeof verifier)=>{verifier=v;}};
}
test('an execution fact preserves the exact selected plan, original choice scope and independently observed extent',async()=>{
 const f=await fixture();try{
  assert.deepEqual(f.outcomes.projection(),{executions:[],observations:[]});
  const saved=await f.outcomes.saveExecution(f.binding,f.input);
  assert.deepEqual(saved.artifact,f.decision.artifact);assert.equal(saved.choiceId,f.choice.id);assert.equal(saved.choice.scope,'Only part A1');assert.equal(saved.scope,'Only part A1 item 1');assert.equal(saved.status,'partial');assert.equal(saved.revision,1);assert.equal(saved.asOf,'2026-11-17T11:00:00.000Z');assert.deepEqual(saved.evidence,[evidence]);
  assert.deepEqual(await f.outcomes.readExecution(f.binding,{id:saved.id,revision:1}),saved);assert.equal(f.decisions.choices().length,1);assert.equal(f.outcomes.projection().observations.length,0);assert.equal('attribution' in saved,false);
 }finally{f.store.close();}
});
test('execution requests are immutable and exact retries do not duplicate a fact or rewrite old revisions',async()=>{
 const f=await fixture();try{
  const first=await f.outcomes.saveExecution(f.binding,f.input);assert.deepEqual(await f.outcomes.saveExecution(f.binding,f.input),first);assert.equal(f.outcomes.history().length,1);
  await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,extent:'Changed content under an old request'}),{code:'outcome_conflict'});
  const second=await f.outcomes.saveExecution(f.binding,{...f.input,id:first.id,expectedRevision:1,requestId:'revision-two',status:'completed',endedAt:'2026-11-17T10:50:00Z',extent:'The selected item is completed; no effect attribution',reason:'New authorized execution evidence'});
  assert.equal(second.revision,2);assert.deepEqual(second.supersedes,{id:first.id,revision:1});assert.equal((await f.outcomes.readExecution(f.binding,{id:first.id,revision:1})).status,'partial');
  await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,id:first.id,expectedRevision:1,requestId:'lost-cas'}),{code:'outcome_conflict'});
  assert.equal(f.outcomes.history().length,2);assert.equal(f.decisions.choices().length,1);
 }finally{f.store.close();}
});
test('an immature observation and a missing-data check are independent of execution and never create attribution',async()=>{
 const f=await fixture();try{
  const execution=await f.outcomes.saveExecution(f.binding,f.input),ref={id:execution.id,revision:1};
  const immature=await f.outcomes.saveObservation(f.binding,f.observation(ref));assert.equal(immature.maturity,'immature');assert.deepEqual(immature.execution,ref);assert.equal(immature.result,'Limited apparent improvement; not yet mature');
  const missing=await f.outcomes.saveObservation(f.binding,{...f.observation(ref),requestId:'missing-data',maturity:'missing_data',result:'No valid observation available',evidence:[],gaps:['Expected report unavailable']});assert.equal(missing.maturity,'missing_data');assert.deepEqual(missing.evidence,[]);
  const mature=await f.outcomes.saveObservation(f.binding,{...f.observation(ref),id:immature.id,expectedRevision:1,requestId:'mature-revision',maturity:'mature',gaps:[],result:'Apparent improvement in the completed observation window; causal effect unknown',reason:'A mature observation is now available'});
  assert.equal(mature.revision,2);assert.equal((await f.outcomes.readObservation(f.binding,{id:immature.id,revision:1})).maturity,'immature');assert.equal(f.outcomes.projection().observations.length,3);assert.equal(f.decisions.choices().length,1);assert.equal(f.outcomes.history().filter(v=>'attribution' in v).length,0);
 }finally{f.store.close();}
});
test('missing records stay unknown and completed or observed facts require a source or a real operator statement',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,evidence:[]}),{code:'outcome_provenance_required'});
  const unknown=await f.outcomes.saveExecution(f.binding,{...f.input,requestId:'unknown',status:'unknown',evidence:[],startedAt:undefined,extent:'Actual execution is unconfirmed',unknowns:['No execution record available']});assert.equal(unknown.status,'unknown');
  await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,requestId:'invented-operator',evidence:[],statementIds:['model-invented-message']}),{code:'outcome_statement_not_found'});
  const d=f.store.get(owner,f.d.id),withMessage=f.store.appendMessage(owner,f.d.id,{expectedVersion:d.version,text:'  Only item 1 actually started; other execution is unknown.  ',idempotencyKey:'execution-statement'});const statement=withMessage.messages.at(-1)!;
  const stated=await f.outcomes.saveExecution(f.binding,{...f.input,requestId:'stated-execution',evidence:[],statementIds:[statement.id]});assert.deepEqual(stated.statements,[{kind:'operator_statement',messageId:statement.id,text:statement.text,createdAt:statement.createdAt}]);assert.equal(stated.statements[0].text,statement.text);assert.equal('independentlyVerified' in stated,false);
  const ref={id:stated.id,revision:1};await assert.rejects(f.outcomes.saveObservation(f.binding,{...f.observation(ref),evidence:[]}),{code:'outcome_provenance_required'});
  await assert.rejects(f.outcomes.saveObservation(f.binding,{...f.observation(ref),requestId:'empty-missing',maturity:'missing_data',evidence:[],gaps:[]}),{code:'outcome_invalid'});
  assert.equal(f.decisions.choices().length,1);
 }finally{f.store.close();}
});
test('actual execution and observation times cannot silently become future plans or impossible calendar facts',async()=>{
 const f=await fixture();try{
  for(const change of [{asOf:'2026-11-17T12:00:00.001Z'},{asOf:'2026-02-30T10:00:00Z'},{startedAt:'2026-11-17T11:10:00Z'},{endedAt:'2026-11-17T09:00:00Z'},{status:'not_started' as const}])await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,...change}),{code:'outcome_invalid'});
  const execution=await f.outcomes.saveExecution(f.binding,f.input),observation=f.observation({id:execution.id,revision:1});
  for(const change of [{observedAt:'2026-11-17T12:01:00Z'},{period:{from:'2026-11-17T11:00:00Z',to:'2026-11-17T10:00:00Z'}},{period:{from:'2026-11-17T10:00:00Z',to:'2026-11-17T11:40:00Z'}}])await assert.rejects(f.outcomes.saveObservation(f.binding,{...observation,...change}),{code:'outcome_invalid'});
  assert.equal(f.outcomes.history().length,1);
 }finally{f.store.close();}
});
test('new recommendations and newer execution records never move a late result away from its exact original plan and execution',async()=>{
 const f=await fixture();try{
  const execution=await f.outcomes.saveExecution(f.binding,f.input);const updated=await f.outcomes.saveExecution(f.binding,{...f.input,id:execution.id,expectedRevision:1,requestId:'execution-two',extent:'Newer execution snapshot for a later part',reason:'Further execution source'});
  await f.artifacts.save(f.binding,{artifactId:f.artifact.artifactId,expectedVersion:1,requestId:'new-plan',reason:'Changed recommendation, original operating choice stays unchanged',content:{...plan,summary:'A new recommendation'}});
  const late=await f.outcomes.saveObservation(f.binding,{...f.observation({id:execution.id,revision:1}),requestId:'late-original-execution'});assert.equal(late.artifact.version,1);assert.equal(late.execution.revision,1);assert.equal(late.choiceId,f.choice.id);assert.equal((await f.outcomes.readExecution(f.binding,{id:execution.id,revision:1})).extent,execution.extent);
  assert.equal(f.outcomes.isCurrentReference(f.binding,{kind:'execution',id:execution.id,revision:1},execution.artifact),false);assert.equal(f.outcomes.isCurrentReference(f.binding,{kind:'execution',id:updated.id,revision:2},updated.artifact),true);assert.equal(f.outcomes.isCurrentReference(f.binding,{kind:'observation',id:late.id,revision:1},late.artifact),false);assert.equal(f.outcomes.isCurrentReference(f.binding,{kind:'observation',id:late.id,revision:1},late.artifact,{id:updated.id,revision:2}),true);assert.equal((await f.outcomes.readObservation(f.binding,{id:late.id,revision:1})).execution.revision,1);
  const projected=f.outcomes.projection();assert.equal(projected.executions[0].latest,false);assert.equal(projected.observations[0].qualification,'current');assert.equal(f.decisions.choices()[0].artifact.version,1);
 }finally{f.store.close();}
});
test('a new source epoch needs complete exact revalidation and a failed current read removes all derived body access',async()=>{
 const f=await fixture();try{
  const execution=await f.outcomes.saveExecution(f.binding,{...f.input,extent:'SYNTHETIC_PRIVATE_EXECUTION_BODY'}),observation=await f.outcomes.saveObservation(f.binding,{...f.observation({id:execution.id,revision:1}),result:'SYNTHETIC_PRIVATE_OBSERVATION_BODY'});
  f.setEpoch(1);const current={...f.binding,epoch:1};assert.equal(JSON.stringify(f.outcomes.projection()).includes('SYNTHETIC_PRIVATE_'),false);assert.equal(f.outcomes.meta(current).length,2);assert.equal(JSON.stringify(f.outcomes.meta(current)).includes('SYNTHETIC_PRIVATE_'),false);assert.equal(f.outcomes.isCurrentReference(current,{kind:'observation',id:observation.id,revision:1}),false);
  const read=await f.outcomes.readObservation(current,{id:observation.id,revision:1});assert.equal(read.epoch,0);assert.equal(read.result,'SYNTHETIC_PRIVATE_OBSERVATION_BODY');assert.equal(f.outcomes.projection().executions[0].qualification,'current');assert.equal(f.outcomes.projection().observations[0].qualification,'current');assert.equal(f.outcomes.history()[0].epoch,0);
  f.setEvidenceCurrent(false);await assert.rejects(f.outcomes.readExecution(current,{id:execution.id,revision:1}),error=>{assert.equal((error as Error).message.includes('SENSITIVE_SYNTHETIC_SOURCE_DIAGNOSTIC'),false);return (error as {code:string}).code==='outcome_evidence_unavailable';});assert.equal(JSON.stringify(f.outcomes.projection()).includes('SYNTHETIC_PRIVATE_'),false);assert.equal(f.outcomes.isCurrentReference(current,{kind:'observation',id:observation.id,revision:1}),false);
  f.setEvidenceCurrent(true);await f.outcomes.readObservation(current,{id:observation.id,revision:1});assert.equal(f.outcomes.projection().observations[0].qualification,'current');assert.equal(f.outcomes.history().length,2);
 }finally{f.store.close();}
});
test('wrong plan, another choice, invented execution and reassigned stable facts are rejected without creating operating facts',async()=>{
 const f=await fixture();try{
  const otherPlan=await f.artifacts.save(f.binding,{expectedVersion:0,requestId:'other-plan',reason:'A separate proposal',content:{...plan,title:'Separate plan'}});
  await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,artifact:{artifactId:otherPlan.artifactId,version:1}}),{code:'outcome_choice_mismatch'});
  await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,choiceId:'model-invented-choice'}),{code:'outcome_choice_mismatch'});
  const second=await f.decisions.save(f.binding,{expectedRevision:0,requestId:'second-decision',artifact:f.decision.artifact,title:'Independent choice',question:'A separate scope?',options:[{id:'b',label:'Observe B',scope:'Only B',costs:'Unknown',risks:'Unknown'}],recommendation:{optionId:'b',reason:'Independent'},unknowns:['Effect unknown'],nondecisionImpact:'Other research continues',nextActions:['Continue research'],window:{basis:'Synthetic window',nextReviewAt:'2026-11-17T13:00:00Z'},reason:'Separate operating choice'});
  f.decisions.respond({id:second.id,revision:1,artifact:second.artifact,requestId:'second-choice',action:'adopt',optionId:'b',text:'Adopt B only'});const secondChoice=f.decisions.choices().at(-1)!;
  const execution=await f.outcomes.saveExecution(f.binding,f.input),ref={id:execution.id,revision:1};
  await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,id:execution.id,expectedRevision:1,requestId:'wrong-reassign',choiceId:secondChoice.id}),{code:'outcome_association_changed'});
  await assert.rejects(f.outcomes.saveObservation(f.binding,{...f.observation(ref),choiceId:secondChoice.id}),{code:'outcome_execution_mismatch'});
  await assert.rejects(f.outcomes.saveObservation(f.binding,{...f.observation({id:'invented-execution',revision:1})}),{code:'outcome_execution_mismatch'});
  assert.equal(f.outcomes.history().length,1);assert.equal(f.decisions.choices().length,2);
 }finally{f.store.close();}
});
test('owner, role, lifecycle and goal checks never grant a stale Agent authority to append or read result bodies',async()=>{
 const f=await fixture();try{
  const execution=await f.outcomes.saveExecution(f.binding,f.input),ref={id:execution.id,revision:1};
  await assert.rejects(f.outcomes.readExecution({...f.binding,owner:{...owner,principalId:'other'}},ref),{code:'outcome_scope'});
  await assert.rejects(f.outcomes.saveExecution({...f.binding,role:'worker'},f.input),{code:'outcome_role'});
  await assert.rejects(f.outcomes.saveExecution({...f.binding,generation:0},f.input),{code:'outcome_role'});
  const order={...f.binding,owner:{principalId:owner.principalId,enterpriseId:owner.enterpriseId}};assert.equal((await f.outcomes.readExecution(order,ref)).id,execution.id);
  f.setCurrent(false);await assert.rejects(f.outcomes.readExecution(f.binding,ref),{code:'outcome_unqualified'});f.setCurrent(true);
  const pausing=f.store.requestLifecycle(owner,f.d.id,{action:'pause',expectedVersion:f.store.get(owner,f.d.id).version,idempotencyKey:'pause'});
  await assert.rejects(f.outcomes.saveExecution(f.binding,{...f.input,requestId:'paused-write'}),{code:'outcome_unqualified'});assert.equal(f.outcomes.isCurrentReference(f.binding,{kind:'execution',...ref}),false);
  const paused=f.store.completeLifecycle(owner,f.d.id,{operationId:pausing.pendingOperation!.id,expectedVersion:pausing.pendingOperation!.requestedVersion,outcome:'stopped',evidence:'Synthetic no-runtime stop receipt'});
  assert.equal(f.outcomes.projection().executions[0].qualification,'current');
  f.store.requestLifecycle(owner,f.d.id,{action:'end',expectedVersion:paused.version,idempotencyKey:'end'});assert.equal(f.outcomes.projection().executions[0].qualification,'unavailable');assert.equal(f.outcomes.history().length,1);
 }finally{f.store.close();}
 const changed=await fixture();try{const execution=await changed.outcomes.saveExecution(changed.binding,changed.input);changed.store.adjust(owner,changed.d.id,{expectedVersion:changed.store.get(owner,changed.d.id).version,goal:'A different goal',idempotencyKey:'new-goal'});await assert.rejects(changed.outcomes.readExecution({...changed.binding,goalRevision:2},{id:execution.id,revision:1}),{code:'outcome_stale'});assert.equal(changed.outcomes.projection().executions[0].qualification,'unavailable');assert.deepEqual(changed.outcomes.meta({...changed.binding,goalRevision:2}),[]);}finally{changed.store.close();}
});
test('an asynchronous source or generation qualification change cannot commit a late result fact',async()=>{
 const f=await fixture();try{
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});f.setVerifier(async()=>{entered();await gate;});
  const pending=f.outcomes.saveExecution(f.binding,f.input);await started;f.setEpoch(1);release();await assert.rejects(pending,{code:'outcome_unqualified'});assert.deepEqual(f.outcomes.history(),[]);
 }finally{f.store.close();}
 const generation=await fixture();try{
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});generation.setVerifier(async()=>{entered();await gate;});const pending=generation.outcomes.saveExecution(generation.binding,generation.input);await started;generation.setCurrent(false);release();await assert.rejects(pending,{code:'outcome_unqualified'});assert.deepEqual(generation.outcomes.history(),[]);
 }finally{generation.store.close();}
});
test('separate SQLite connections serialize competing result revisions and preserve exact request identities',async()=>{
 const base=resolve('.local/archives/outcomes-v01-20261117/author-store/cases');mkdirSync(base,{recursive:true});const directory=mkdtempSync(join(base,'cas-')),filename=join(directory,'business.sqlite'),a=await fixture(filename),b=await fixture(filename);
 try{
  const first=await a.outcomes.saveExecution(a.binding,a.input),input={...a.input,id:first.id,expectedRevision:1};const results=await Promise.allSettled([a.outcomes.saveExecution(a.binding,{...input,requestId:'connection-a',extent:'New observation A'}),b.outcomes.saveExecution(b.binding,{...input,requestId:'connection-b',extent:'New observation B'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(a.outcomes.history().length,2);assert.equal(b.outcomes.history().length,2);
  const exact=await a.outcomes.saveExecution(a.binding,a.input);assert.equal(exact.id,first.id);assert.equal(exact.revision,1);await assert.rejects(b.outcomes.saveExecution(b.binding,{...a.input,extent:'Changed same request across connections'}),{code:'outcome_conflict'});
 }finally{a.store.close();b.store.close();}
});
test('business reopen retains execution, original operator statement, exact observation and qualification receipts',async()=>{
 const base=resolve('.local/archives/outcomes-v01-20261117/author-store/cases');mkdirSync(base,{recursive:true});const directory=mkdtempSync(join(base,'reopen-')),filename=join(directory,'business.sqlite'),first=await fixture(filename);let executionId='',observationId='',messageId='';
 try{const d=first.store.get(owner,first.d.id),updated=first.store.appendMessage(owner,first.d.id,{expectedVersion:d.version,text:'Only the observed item was executed.',idempotencyKey:'statement'});messageId=updated.messages.at(-1)!.id;const execution=await first.outcomes.saveExecution(first.binding,{...first.input,evidence:[],statementIds:[messageId]});executionId=execution.id;const observation=await first.outcomes.saveObservation(first.binding,first.observation({id:execution.id,revision:1}));observationId=observation.id;}finally{first.store.close();}
 const reopened=await fixture(filename);try{const execution=await reopened.outcomes.readExecution({...reopened.binding,generation:2},{id:executionId,revision:1});assert.equal(execution.statements[0].messageId,messageId);assert.equal(execution.statements[0].kind,'operator_statement');const observation=await reopened.outcomes.readObservation(reopened.binding,{id:observationId,revision:1});assert.deepEqual(observation.execution,{id:executionId,revision:1});assert.equal(observation.maturity,'immature');assert.equal(reopened.outcomes.history().length,2);assert.equal(reopened.outcomes.projection().observations[0].qualification,'current');assert.equal(reopened.decisions.choices().length,1);}finally{reopened.store.close();}
});
test('object key order does not change a technical request identity or create a duplicate result revision',async()=>{
 const f=await fixture();try{
  const first=await f.outcomes.saveExecution(f.binding,f.input),reordered=Object.fromEntries(Object.entries(f.input).reverse()) as unknown as SaveExecution;
  assert.deepEqual(await f.outcomes.saveExecution(f.binding,reordered),first);
  const repeated=await f.outcomes.saveExecution(f.binding,{...reordered,id:first.id,expectedRevision:1,requestId:'same-body-different-order'});assert.equal(repeated.revision,1);assert.equal(f.outcomes.history().length,1);
 }finally{f.store.close();}
});
