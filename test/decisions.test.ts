import {test} from 'node:test';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import type {ArtifactContent} from '../src/artifacts.ts';
import {DecisionStore} from '../src/decisions.ts';
import type {SaveDecision} from '../src/decisions.ts';
import type {RunBinding} from '../runtime/index.ts';
const owner={enterpriseId:'decision-engineering',principalId:'operator'};
const plan:ArtifactContent={kind:'plan',title:'Synthetic plan',summary:'Synthetic bounded recommendation',evidence:[],assumptions:[],unknowns:['No enterprise/model evidence'],applicability:'Synthetic only',invalidatedBy:['Changed authorized facts'],recommendation:'Observe one part',alternatives:[{option:'Observe',costs:'Synthetic attention',risks:'Unknown'}],constraints:['No business execution'],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic observation',window:'Synthetic review',source:'Synthetic fixture',check:'Recheck'}};
async function fixture(filename=':memory:'){
 const store=new SentiStore({filename});const d=store.create(owner,{goal:'Synthetic decisions',idempotencyKey:'create'});
 let now='2026-11-17T04:00:00.000Z',epoch=0,current=true;
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch,role:'main',generation:1};
 const artifacts=new ArtifactStore(store,{owner,delegationId:d.id},{isCurrent:()=>current,verifyEvidence:async()=>{}});
 const artifact=await artifacts.save(binding,{expectedVersion:0,requestId:'plan',reason:'Synthetic plan',content:plan});
 const decisions=new DecisionStore(store,{owner,delegationId:d.id},{isCurrent:b=>current&&b.epoch===epoch,currentEpoch:()=>epoch,isArtifactCurrent:(ref,q)=>artifacts.isCurrentBusinessReference(ref,q),verifyArtifact:(b,ref)=>artifacts.read(b,ref),now:()=>now});
 const input:SaveDecision={expectedRevision:0,requestId:'request',artifact:{artifactId:artifact.artifactId,version:1},title:'Synthetic business choice',question:'Which bounded scope?',options:[{id:'observe',label:'Observe',scope:'Only synthetic part A',costs:'Synthetic attention',risks:'Unknown'}],recommendation:{optionId:'observe',reason:'Limited evidence'},unknowns:['No business value claim'],nondecisionImpact:'Continue independent research',nextActions:['Continue independent evidence checks'],window:{basis:'Synthetic clock only',nextReviewAt:'2026-11-17T05:00:00.000Z',decideBy:'2026-11-17T06:00:00.000Z',executeBy:'2026-11-17T07:00:00.000Z'},reason:'Requires operator choice'};
 return {store,d,binding,artifacts,artifact,decisions,input,setNow:(v:string)=>{now=v;},setEpoch:(v:number)=>{epoch=v;},setCurrent:(v:boolean)=>{current=v;}};
}
test('a pending decision preserves the exact current plan revision, options, scope and real window',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);assert.equal(saved.status,'pending');assert.deepEqual(saved.artifact,f.input.artifact);assert.equal(saved.revision,1);assert.equal(saved.options[0].scope,'Only synthetic part A');assert.deepEqual(saved.window,f.input.window);assert.deepEqual(saved.choices,[]);}finally{f.store.close();}
});
function respond(f:Awaited<ReturnType<typeof fixture>>,saved:{id:string;revision:number;artifact:{artifactId:string;version:number}},extra:Record<string,unknown>={}){return f.decisions.respond({id:saved.id,revision:saved.revision,artifact:saved.artifact,requestId:'human-response',action:'acknowledge',text:'已读',...extra} as Parameters<DecisionStore['respond']>[0]);}
test('acknowledgement and silence are never adoption and Agent cannot upgrade a typed read receipt',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);assert.equal(f.decisions.get(saved.id)?.status,'pending');assert.equal(f.decisions.choices().length,0);
 const ack=respond(f,saved);assert.equal(ack.state,'acknowledged');assert.equal(f.decisions.get(saved.id)?.status,'pending');assert.equal(f.decisions.choices().length,0);
 await assert.rejects(f.decisions.interpret(f.binding,{responseId:ack.responseId,requestId:'fake-adoption',action:'adopt',optionId:'observe',reason:'A read receipt is not a choice'}),{code:'decision_acknowledgement_only'});
 assert.equal(f.decisions.get(saved.id)?.seenAt,ack.createdAt);assert.equal(f.decisions.choices().length,0);assert.equal((await f.decisions.context(f.binding))[0].status,'pending');
 }finally{f.store.close();}
});
test('deferring or rejecting a decision does not silently apply to the whole shared plan',async()=>{
 const f=await fixture();try{
  const first=await f.decisions.save(f.binding,f.input);
  const second=await f.decisions.save(f.binding,{...f.input,requestId:'separate-choice',question:'A separate choice under the same exact plan'});
  respond(f,first,{requestId:'defer-only-this',action:'defer',text:'暂缓此事项'});
  const deferred=f.decisions.choices()[0];assert.equal(deferred.scope,'仅此待决事项');assert.equal(deferred.decisionId,first.id);assert.deepEqual(deferred.artifact,second.artifact);
  assert.equal(f.decisions.get(first.id)?.status,'deferred');assert.equal(f.decisions.get(second.id)?.status,'pending');
  respond(f,second,{requestId:'reject-only-option',action:'reject',optionId:'observe',text:'不采纳该选项'});
  assert.equal(f.decisions.choices()[1].scope,second.options[0].scope);
 }finally{f.store.close();}
});
test('explicit partial adoption preserves original text, accurate version and selected scope without execution claims',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);const response=respond(f,saved,{action:'partial',optionId:'observe',scope:'Only synthetic subset A1',text:'  只采纳 A1 部分，其他继续研究。  '});
 const [choice]=f.decisions.choices();assert.equal(response.state,'chosen');assert.equal(choice.action,'partial');assert.equal(choice.scope,'Only synthetic subset A1');assert.equal(choice.text,'  只采纳 A1 部分，其他继续研究。  ');assert.deepEqual(choice.actor,owner);assert.deepEqual(choice.artifact,saved.artifact);assert.equal(choice.revision,1);assert.equal(choice.source,'explicit');assert.equal('executed' in choice,false);
 assert.equal(f.decisions.get(saved.id)?.status,'chosen');assert.equal(f.store.get(owner,f.d.id).lifecycle,'active');
 await assert.rejects(f.decisions.interpret(f.binding,{responseId:response.responseId,requestId:'expand',action:'adopt',optionId:'observe',reason:'Must not expand partial scope'}),{code:'decision_response_scope'});
 assert.equal(f.decisions.choices().length,1);
 }finally{f.store.close();}
});
test('full adoption uses exact option scope; partial and adjusted choices require explicit bounded scope',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);
 assert.throws(()=>respond(f,saved,{action:'adopt',optionId:'observe',scope:'An expanded scope'}),{code:'decision_invalid'});
 assert.throws(()=>respond(f,saved,{action:'partial',optionId:'observe'}),{code:'decision_invalid'});
 assert.throws(()=>respond(f,saved,{action:'adjust'}),{code:'decision_invalid'});
 const response=respond(f,saved,{action:'adopt',optionId:'observe',text:'采纳所列范围'});assert.equal(response.state,'chosen');assert.equal(f.decisions.choices()[0].scope,saved.options[0].scope);
 }finally{f.store.close();}
});
test('a persisted sentence reply is interpreted once and cannot be invented from a model or source id',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);
 await assert.rejects(f.decisions.interpret(f.binding,{responseId:'source-or-model-invented-input',requestId:'invent',action:'adopt',optionId:'observe',reason:'Not a human input'}),{code:'decision_response_not_found'});
 const raw=respond(f,saved,{action:'reply',text:'只观察 A1，其他不采纳'});assert.equal(raw.state,'pending');assert.equal(f.decisions.choices().length,0);
 const input={responseId:raw.responseId,requestId:'interpret',action:'partial' as const,optionId:'observe',scope:'Only A1',reason:'The stored sentence explicitly limits the selected part'};
 const interpreted=await f.decisions.interpret(f.binding,input);assert.equal(interpreted.state,'chosen');assert.equal(f.decisions.choices()[0].source,'interpreted');assert.equal(f.decisions.choices()[0].text,raw.text);
 await f.decisions.interpret(f.binding,input);assert.equal(f.decisions.choices().length,1);
 await assert.rejects(f.decisions.interpret(f.binding,{...input,requestId:'reinterpret',scope:'All parts'}),{code:'decision_response_interpreted'});
 }finally{f.store.close();}
});
test('an ambiguous sentence can remain pending without forcing a business choice',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);const raw=respond(f,saved,{action:'reply',text:'再看看'});
 const result=await f.decisions.interpret(f.binding,{responseId:raw.responseId,requestId:'clarify',action:'clarify',reason:'Whether this is postponement or a research request is not clear'});assert.equal(result.state,'pending');assert.equal(f.decisions.get(saved.id)?.status,'pending');assert.equal(f.decisions.choices().length,0);
 }finally{f.store.close();}
});
test('new plan and decision revisions never silently inherit old choices, and old browser versions cannot choose',async()=>{
 const f=await fixture();try{const first=await f.decisions.save(f.binding,f.input);const response=respond(f,first,{action:'adopt',optionId:'observe',text:'采纳 v1'});
 const newer=await f.artifacts.save(f.binding,{artifactId:f.artifact.artifactId,expectedVersion:1,requestId:'plan-v2',reason:'New synthetic facts',content:{...plan,summary:'Version two'}});
 assert.equal(f.decisions.get(first.id)?.qualification,'historical');assert.equal(f.decisions.listCurrent(f.binding).length,0);
 assert.throws(()=>respond(f,first,{requestId:'stale-browser',action:'adopt',optionId:'observe',text:'Old page'}),{code:'decision_stale'});
 assert.equal(respond(f,first,{action:'adopt',optionId:'observe',text:'采纳 v1'}).responseId,response.responseId);
 const second=await f.decisions.save(f.binding,{...f.input,id:first.id,expectedRevision:1,requestId:'decision-v2',artifact:{artifactId:newer.artifactId,version:newer.version},reason:'Revised choice under new plan'});
 assert.equal(second.revision,2);assert.equal(second.status,'pending');assert.deepEqual(second.choices,[]);assert.equal(f.decisions.choices().length,1);assert.equal(f.decisions.choices()[0].artifact.version,1);
 await assert.rejects(f.decisions.read(f.binding,{id:first.id,revision:1}),{code:'decision_stale'});
 }finally{f.store.close();}
});
test('an expired decision preserves late human input but needs explicit current applicability review before choice',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);f.setNow('2026-11-17T06:30:00.000Z');const late=respond(f,saved,{action:'adopt',optionId:'observe',text:'晚到的明确采纳'});
 assert.equal(late.state,'held');assert.equal(f.decisions.choices().length,0);assert.equal(f.decisions.get(saved.id)?.windowState,'expired');assert.equal(f.decisions.get(saved.id)?.status,'pending');
 const input={responseId:late.responseId,requestId:'late-review',action:'adopt' as const,optionId:'observe',reason:'Explicit late choice'};
 await assert.rejects(f.decisions.interpret(f.binding,input),{code:'decision_revalidation_required'});
 await f.decisions.interpret(f.binding,{...input,revalidationReason:'Exact current plan remains applicable; no execution has occurred'});assert.equal(f.decisions.choices().length,1);assert.equal(f.decisions.choices()[0].revalidationReason,'Exact current plan remains applicable; no execution has occurred');
 }finally{f.store.close();}
});
test('an execution-only deadline also holds late choices and interpretation until applicability is revalidated',async()=>{
 const f=await fixture();try{
  const item=await f.decisions.save(f.binding,{...f.input,window:{executeBy:'2026-11-17T05:00:00Z',basis:'Execution expires at 05:00; no separately reliable decision deadline',nextReviewAt:'2026-11-17T06:00:00Z'}});
  const raw=respond(f,item,{requestId:'before-expiry-reply',action:'reply',text:'只采纳 A1'});
  f.setNow('2026-11-17T05:30:00Z');
  const late=respond(f,item,{requestId:'after-execution-deadline',action:'adopt',optionId:'observe',text:'晚到采纳'});
  assert.equal(late.state,'held');assert.equal(f.decisions.choices().length,0);assert.equal(f.decisions.get(item.id)?.windowState,'expired');
  const interpretation={responseId:raw.responseId,requestId:'review-after-execution',action:'partial' as const,optionId:'observe',scope:'Only A1',reason:'Stored explicit partial choice'};
  await assert.rejects(f.decisions.interpret(f.binding,interpretation),{code:'decision_revalidation_required'});
  await f.decisions.interpret(f.binding,{...interpretation,revalidationReason:'Original execution timing elapsed; checked current applicability before retaining this scope'});
  assert.equal(f.decisions.choices().length,1);assert.equal(f.decisions.get(item.id)?.window.decideBy,undefined);
 }finally{f.store.close();}
});
test('a reminder or review point alone does not become an invented hard decision deadline',async()=>{
 const f=await fixture();try{
  const item=await f.decisions.save(f.binding,{...f.input,window:{remindAt:'2026-11-17T04:30:00Z',basis:'No reliable hard deadline',nextReviewAt:'2026-11-17T05:00:00Z'}});
  f.setNow('2026-11-17T05:30:00Z');
  assert.equal(f.decisions.get(item.id)?.windowState,'open');
  assert.equal(respond(f,item,{action:'adopt',optionId:'observe',text:'明确采纳当前范围'}).state,'chosen');
 }finally{f.store.close();}
});
test('pause preserves raw human response, resume requires review, and end closes unresolved items without adoption',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);const pausing=f.store.requestLifecycle(owner,f.d.id,{expectedVersion:1,idempotencyKey:'pause',action:'pause'});
 f.store.completeLifecycle(owner,f.d.id,{expectedVersion:pausing.pendingOperation!.requestedVersion,operationId:pausing.pendingOperation!.id,outcome:'stopped',evidence:'Synthetic stopped receipt'});
 const raw=respond(f,saved,{action:'partial',optionId:'observe',scope:'Only A1',text:'暂停期间的回应'});assert.equal(raw.state,'held');assert.equal(f.decisions.choices().length,0);
 await assert.rejects(f.decisions.context(f.binding),{code:'decision_unqualified'});
 const d=f.store.get(owner,f.d.id);const resuming=f.store.requestLifecycle(owner,f.d.id,{expectedVersion:d.version,idempotencyKey:'resume',action:'resume'});f.store.completeLifecycle(owner,f.d.id,{expectedVersion:resuming.pendingOperation!.requestedVersion,operationId:resuming.pendingOperation!.id,outcome:'eligible',evidence:'Synthetic current qualification'});
 await assert.rejects(f.decisions.interpret(f.binding,{responseId:raw.responseId,requestId:'resume-review',action:'partial',optionId:'observe',scope:'Only A1',reason:'Restore does not automatically apply a paused choice'}),{code:'decision_revalidation_required'});
 const end=f.store.requestLifecycle(owner,f.d.id,{expectedVersion:f.store.get(owner,f.d.id).version,idempotencyKey:'end',action:'end'});f.store.completeLifecycle(owner,f.d.id,{expectedVersion:end.pendingOperation!.requestedVersion,operationId:end.pendingOperation!.id,outcome:'stopped',evidence:'Synthetic stopped receipt'});
 assert.equal(f.decisions.reconcile()[0].status,'closed');assert.equal(f.decisions.choices().length,0);assert.throws(()=>respond(f,saved,{requestId:'after-end',action:'adopt',optionId:'observe',text:'Late reply'}),{code:'decision_closed'});
 assert.equal(f.decisions.get(saved.id)?.responses.length,1);
 }finally{f.store.close();}
});
test('time windows reject fabricated dates, missing review points and contradictory timing',async()=>{
 const f=await fixture();try{for(const w of [{basis:'No review point'}, {...f.input.window,nextReviewAt:'2026-02-30T05:00:00Z'}, {...f.input.window,decideBy:'2026-11-17T08:00:00Z'}, {...f.input.window,remindAt:'2026-11-17T06:30:00Z'}, {...f.input.window,nextReviewAt:'2026-11-17T04:30:00'}]){
 await assert.rejects(f.decisions.save(f.binding,{...f.input,window:w as SaveDecision['window']}),{code:'decision_invalid'});}
 const noDeadline=await f.decisions.save(f.binding,{...f.input,window:{basis:'No reliable hard deadline; review the current uncertainty',nextReviewAt:'2026-11-17T05:00:00Z'}});assert.equal(noDeadline.window.decideBy,undefined);assert.equal(noDeadline.windowState,'open');
 }finally{f.store.close();}
});
test('owner, role, raw-field and exact version boundaries reject foreign or forged facts',async()=>{
 const f=await fixture();try{
 await assert.rejects(f.decisions.save({...f.binding,owner:{...owner,principalId:'foreign'}},f.input),{code:'decision_scope'});
 await assert.rejects(f.decisions.save({...f.binding,role:'worker',assignmentId:'synthetic-worker'},f.input),{code:'decision_role'});
 const saved=await f.decisions.save(f.binding,f.input);
 assert.throws(()=>f.decisions.respond({id:saved.id,revision:saved.revision,artifact:saved.artifact,requestId:'forged-owner',action:'acknowledge',text:'Seen',actor:{enterpriseId:'forged',principalId:'forged'}} as Parameters<DecisionStore['respond']>[0]),{code:'decision_invalid'});
 assert.throws(()=>respond(f,saved,{artifact:{...saved.artifact,version:99},requestId:'wrong-artifact'}),{code:'decision_stale'});
 assert.throws(()=>respond(f,saved,{id:'another-delegation-item',requestId:'foreign'}),{code:'decision_not_found'});
 const safe=f.decisions.listCurrent(f.binding);assert.equal(JSON.stringify(safe).includes('Which bounded scope?'),false);assert.equal(JSON.stringify(safe).includes('Limited evidence'),false);
 }finally{f.store.close();}
});
test('goal or source qualification changes suppress derived bodies, including Agent idempotency replays',async()=>{
 const f=await fixture();try{const saved=await f.decisions.save(f.binding,f.input);const raw=respond(f,saved,{action:'reply',text:'该资料中的描述需要核对'});const interpretation={responseId:raw.responseId,requestId:'seen-interpretation',action:'acknowledge' as const,reason:'Awareness only'};await f.decisions.interpret(f.binding,interpretation);
 f.setEpoch(1);const next={...f.binding,epoch:1};assert.equal(f.decisions.listCurrent(next).length,0);assert.deepEqual(await f.decisions.context(next),[]);
 await assert.rejects(f.decisions.save(f.binding,f.input),{code:'decision_unqualified'});await assert.rejects(f.decisions.interpret(f.binding,interpretation),{code:'decision_unqualified'});
 await assert.rejects(f.decisions.read(next,{id:saved.id,revision:1}),{code:'decision_stale'});
 f.setEpoch(0);f.setCurrent(false);await assert.rejects(f.decisions.save(f.binding,f.input),{code:'decision_unqualified'});assert.equal(f.decisions.list()[0].question,'Which bounded scope?');
 }finally{f.store.close();}
});
test('concurrent revisions compare expected revision atomically and retain old exact content',async()=>{
 const f=await fixture();try{const first=await f.decisions.save(f.binding,f.input);const base={...f.input,id:first.id,expectedRevision:1};const results=await Promise.allSettled([f.decisions.save(f.binding,{...base,requestId:'left',question:'Left precise question'}),f.decisions.save(f.binding,{...base,requestId:'right',question:'Right precise question'})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const rejected=results.find(x=>x.status==='rejected');assert.equal(rejected?.status==='rejected'?(rejected.reason as {code:string}).code:'','decision_conflict');assert.equal(f.decisions.list().length,2);assert.equal(f.decisions.get(first.id,1)?.question,'Which bounded scope?');
 }finally{f.store.close();}
});
test('current qualification is checked again after asynchronous plan verification and replay verification',async()=>{
 const f=await fixture();let release!:(v:typeof f.artifact)=>void;let waiting=false;
 const decisions=new DecisionStore(f.store,{owner,delegationId:f.d.id},{isCurrent:()=>!waiting,currentEpoch:()=>0,isArtifactCurrent:(ref,q)=>f.artifacts.isCurrentBusinessReference(ref,q),verifyArtifact:async()=>new Promise(resolve=>{release=resolve;}),now:()=> '2026-11-17T04:00:00.000Z'});
 try{
 const pending=decisions.save(f.binding,{...f.input,requestId:'race'});waiting=true;release(f.artifact);await assert.rejects(pending,{code:'decision_unqualified'});assert.equal(decisions.list().length,0);
 waiting=false;const savedPending=decisions.save(f.binding,{...f.input,requestId:'replay-race'});release(f.artifact);const saved=await savedPending;
 const replay=decisions.save(f.binding,{...f.input,requestId:'replay-race'});waiting=true;release(f.artifact);await assert.rejects(replay,{code:'decision_unqualified'});assert.equal(decisions.get(saved.id)?.revision,1);
 }finally{f.store.close();}
});
test('a plan revision changed during asynchronous verification cannot publish a stale decision',async()=>{
 const f=await fixture();let release!:(v:typeof f.artifact)=>void;
 const decisions=new DecisionStore(f.store,{owner,delegationId:f.d.id},{isCurrent:()=>true,currentEpoch:()=>0,isArtifactCurrent:(ref,q)=>f.artifacts.isCurrentBusinessReference(ref,q),verifyArtifact:async()=>new Promise(resolve=>{release=resolve;}),now:()=> '2026-11-17T04:00:00.000Z'});
 try{const pending=decisions.save(f.binding,f.input);await f.artifacts.save(f.binding,{artifactId:f.artifact.artifactId,expectedVersion:1,requestId:'racing-plan',reason:'New exact plan before commit',content:{...plan,summary:'Changed'}});release(f.artifact);await assert.rejects(pending,{code:'decision_stale'});assert.equal(decisions.list().length,0);}finally{f.store.close();}
});
test('response receipts and immutable choices survive SQLite reopen and replay cannot append duplicate facts',async()=>{
 mkdirSync(resolve('.local/tests'),{recursive:true});const dir=mkdtempSync(join(resolve('.local/tests'),'decisions-reopen-')),filename=join(dir,'business.sqlite');
 const first=await fixture(filename);const saved=await first.decisions.save(first.binding,first.input),input={id:saved.id,revision:saved.revision,artifact:saved.artifact,requestId:'durable-choice',action:'partial' as const,optionId:'observe',scope:'Only A1',text:'只采纳 A1'};const response=first.decisions.respond(input);first.store.close();
 const second=await fixture(filename);try{assert.equal(second.decisions.respond(input).responseId,response.responseId);assert.equal(second.decisions.choices().length,1);assert.equal(second.decisions.choices()[0].scope,'Only A1');assert.equal((await second.decisions.read(second.binding,{id:saved.id,revision:1})).responses.length,1);
 assert.throws(()=>second.decisions.respond({...input,scope:'All parts'}),{code:'decision_conflict'});assert.equal(second.decisions.choices().length,1);
 }finally{second.store.close();rmSync(dir,{recursive:true,force:true});}
});
test('separate SQLite connections cannot both append the same expected decision revision',async()=>{
 mkdirSync(resolve('.local/tests'),{recursive:true});const dir=mkdtempSync(join(resolve('.local/tests'),'decisions-cas-')),filename=join(dir,'business.sqlite');const a=await fixture(filename),b=await fixture(filename);
 try{const first=await a.decisions.save(a.binding,a.input);const base={...a.input,id:first.id,expectedRevision:1};const results=await Promise.allSettled([a.decisions.save(a.binding,{...base,requestId:'connection-a',question:'Precise A'}),b.decisions.save(b.binding,{...base,requestId:'connection-b',question:'Precise B'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.decisions.list().length,2);assert.equal(b.decisions.list().length,2);
 }finally{a.store.close();b.store.close();rmSync(dir,{recursive:true,force:true});}
});
