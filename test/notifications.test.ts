import {test} from 'node:test';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import {DecisionStore} from '../src/decisions.ts';
import {NotificationStore} from '../src/notifications.ts';
import type {SaveNotification,BriefPreferences} from '../src/notifications.ts';
import type {ArtifactReference,ArtifactRevision} from '../src/artifacts.ts';
import type {RunBinding} from '../runtime/index.ts';
const owner={enterpriseId:'notification-fixture',principalId:'operator'};
const plan={kind:'plan' as const,title:'Synthetic plan',summary:'Limited synthetic proposal',evidence:[],assumptions:[],unknowns:['No enterprise data'],applicability:'Synthetic only',invalidatedBy:['Evidence changes'],recommendation:'Observe only',alternatives:[{option:'Observe',costs:'Unknown',risks:'Unknown'}],constraints:['No execution'],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic only',window:'Future evidence',source:'No actual material',check:'Recheck'}};
async function fixture(filename=':memory:'){
 const store=new SentiStore({filename});const d=store.create(owner,{goal:'Synthetic notifications',idempotencyKey:'create'});
 let now='2026-11-17T09:00:00Z',epoch=0,current=true;let preferences:BriefPreferences={timeZone:'Asia/Shanghai',time:'17:00:00',weekdays:[1,2,3,4,5],revision:1};
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main'};
 const artifacts=new ArtifactStore(store,{owner,delegationId:d.id},{isCurrent:()=>current,verifyEvidence:async()=>{}});
 const artifact=await artifacts.save(binding,{expectedVersion:0,requestId:'plan',reason:'Synthetic proposal',content:plan});
 let verifyArtifact:(b:RunBinding,r:ArtifactReference)=>Promise<ArtifactRevision>=(b,r)=>artifacts.read(b,r);
 const decisions=new DecisionStore(store,{owner,delegationId:d.id},{isCurrent:()=>current,currentEpoch:()=>epoch,isArtifactCurrent:(r,q)=>artifacts.isCurrentBusinessReference(r,q),verifyArtifact:(b,r)=>artifacts.read(b,r),now:()=>now});
 const notifications=new NotificationStore(store,{owner,delegationId:d.id},{isCurrent:()=>current,currentEpoch:()=>epoch,isArtifactCurrent:(r,q)=>artifacts.isCurrentBusinessReference(r,q),verifyArtifact:(b,r)=>verifyArtifact(b,r),decisionCurrent:(r)=>{const v=decisions.get(r.id,r.revision);return Boolean(v&&v.qualification==='current'&&['pending','deferred'].includes(v.status));},verifyDecision:(b,r)=>decisions.read(b,r),preferences:()=>preferences,now:()=>now});
 const input:SaveNotification={expectedRevision:0,requestId:'notice',kind:'inform',artifact:{artifactId:artifact.artifactId,version:1},title:'Synthetic important finding',summary:'Only this bounded issue changed',changes:['New limited evidence'],unknowns:['Actual effect unverified'],mergeReason:'One stable issue',urgency:'brief'};
 return{store,d,binding,artifacts,artifact,decisions,notifications,input,setNow:(v:string)=>{now=v;},setEpoch:(v:number)=>{epoch=v;},setCurrent:(v:boolean)=>{current=v;},setPreferences:(v:BriefPreferences)=>{preferences=v;},setVerifier:(v:typeof verifyArtifact)=>{verifyArtifact=v;},restoreVerifier:()=>{verifyArtifact=(b,r)=>artifacts.read(b,r);}};
}
test('an Agent-authored notification preserves an exact current artifact and stable matter identity',async()=>{
 const f=await fixture();try{const saved=await f.notifications.save(f.binding,f.input);assert.equal(saved.revision,1);assert.deepEqual(saved.artifact,f.input.artifact);assert.equal(saved.summary,f.input.summary);}finally{f.store.close();}
});
test('a local workday brief includes all changed matters once and an empty next-day check produces no notice',async()=>{
 const f=await fixture();try{
  const one=await f.notifications.save(f.binding,f.input);const two=await f.notifications.save(f.binding,{...f.input,requestId:'other',title:'Independent issue'});
  const window=f.notifications.briefWindow();assert.equal(window.due,true);const result=await f.notifications.createBrief(f.binding,{requestId:'brief',windowKey:window.key,summary:'Two qualified changes'});
  assert.equal(result.check.status,'published');assert.equal(result.notice?.refs.length,2);assert.deepEqual(result.notice?.refs,[{id:one.id,revision:1},{id:two.id,revision:1}]);
  assert.equal(f.notifications.dueWork(f.binding).brief,null);const repeat=await f.notifications.createBrief(f.binding,{requestId:'brief-repeat',windowKey:window.key,summary:'Same workday check'});assert.equal(repeat.notice?.id,result.notice?.id);
  f.setNow('2026-11-18T09:00:00Z');const quiet=await f.notifications.createBrief(f.binding,{requestId:'quiet',windowKey:f.notifications.briefWindow().key,summary:'No material change'});assert.equal(quiet.check.status,'no_change');assert.equal(quiet.notice,null);
  assert.equal(f.notifications.projection().briefs.length,1);
 }finally{f.store.close();}
});
test('important changes are delivered once per exact matter revision and ordinary findings cannot bypass the brief',async()=>{
 const f=await fixture();try{
  const ordinary=await f.notifications.save(f.binding,f.input);await assert.rejects(f.notifications.immediate(f.binding,{id:ordinary.id,revision:1,requestId:'ordinary-immediate'}));
  const urgent=await f.notifications.save(f.binding,{...f.input,requestId:'urgent',urgency:'immediate',immediateReason:'Waiting loses the stated attention window'});
  const first=await f.notifications.immediate(f.binding,{id:urgent.id,revision:1,requestId:'first'});const second=await f.notifications.immediate(f.binding,{id:urgent.id,revision:1,requestId:'second'});
  assert.equal(first.id,second.id);assert.equal(first.channel,'workbench');assert.deepEqual(first.receiver,owner);assert.equal(f.notifications.dueWork(f.binding).immediate.length,0);
  const revised=await f.notifications.save(f.binding,{...f.input,id:urgent.id,expectedRevision:1,requestId:'new-fact',urgency:'immediate',immediateReason:'Another supported change',summary:'Changed bounded finding',changes:['The same issue acquired new evidence']});
  const next=await f.notifications.immediate(f.binding,{id:revised.id,revision:2,requestId:'third'});assert.notEqual(next.id,first.id);
  const projected=f.notifications.projection();assert.equal(projected.notices.filter(n=>n.qualification==='current').length,1);assert.equal(projected.matters.filter(m=>m.id===urgent.id).length,1);
 }finally{f.store.close();}
});
async function pendingDecision(f:Awaited<ReturnType<typeof fixture>>,requestId='decision'){
 return f.decisions.save(f.binding,{expectedRevision:0,requestId,artifact:{artifactId:f.artifact.artifactId,version:1},title:'Bounded choice',question:'Observe only the proposed scope?',options:[{id:'observe',label:'Observe',scope:'Only the synthetic scope',costs:'Unknown',risks:'Unknown'}],recommendation:{optionId:'observe',reason:'Limited evidence'},unknowns:['No effect claim'],nondecisionImpact:'Only dependent work waits',nextActions:['Continue independent evidence'],window:{remindAt:'2026-11-17T09:01:00Z',nextReviewAt:'2026-11-17T09:02:00Z',decideBy:'2026-11-17T09:03:00Z',executeBy:'2026-11-17T09:04:00Z',basis:'Explicit synthetic observation window'},reason:'Needs operating choice'});
}
test('a reminder must match one exact agreed decision point and silence never creates a repeated choice',async()=>{
 const f=await fixture();try{
  const decision=await pendingDecision(f);const dr={id:decision.id,revision:decision.revision};const matter=await f.notifications.save(f.binding,{...f.input,kind:'decision',decision:dr});
  const input={id:matter.id,revision:1,decision:dr,point:'remindAt' as const,at:decision.window.remindAt!,requestId:'remind',reason:'The agreed reminder point arrived'};
  await assert.rejects(f.notifications.remind(f.binding,input));f.setNow('2026-11-17T09:01:00Z');
  await assert.rejects(f.notifications.remind(f.binding,{...input,at:'2026-11-17T09:00:30Z'}));
  const notice=await f.notifications.remind(f.binding,input);assert.equal(notice.kind,'reminder');assert.equal(f.decisions.choices().length,0);
  f.setNow('2026-11-17T09:02:30Z');assert.equal((await f.notifications.remind(f.binding,{...input,requestId:'same-point-again'})).id,notice.id);
  assert.equal(f.notifications.projection().notices.length,1);assert.equal(f.decisions.get(decision.id)?.status,'pending');
  f.decisions.respond({id:decision.id,revision:1,artifact:decision.artifact,requestId:'human-adopt',action:'adopt',optionId:'observe',text:'Adopt only this option'});
  await assert.rejects(f.notifications.remind(f.binding,{...input,point:'nextReviewAt',at:decision.window.nextReviewAt,requestId:'after-choice'}));
  assert.equal(f.notifications.projection().notices[0].qualification,'unavailable');
 }finally{f.store.close();}
});
test('revising one matter does not repeat the same decision-window reminder or replay its old reason',async()=>{
 const f=await fixture();try{
  const d=await pendingDecision(f),dr={id:d.id,revision:1};const first=await f.notifications.save(f.binding,{...f.input,kind:'decision',decision:dr});f.setNow('2026-11-17T09:01:00Z');
  const input={id:first.id,revision:1,decision:dr,point:'remindAt' as const,at:d.window.remindAt!,requestId:'first',reason:'SYNTHETIC_OLD_REMINDER_REASON'};
  const notice=await f.notifications.remind(f.binding,input);
  const next=await f.notifications.save(f.binding,{...f.input,id:first.id,expectedRevision:1,requestId:'revise',kind:'decision',decision:dr,summary:'Fresh matter revision',changes:['A material refinement']});
  const duplicate=await f.notifications.remind(f.binding,{...input,revision:next.revision,requestId:'same-point-new-prose',reason:'A revised reason cannot repeat the same agreed point'});
  assert.equal(duplicate.id,notice.id);assert.equal('reason' in duplicate,false);assert.equal(f.notifications.projection().notices.length,1);assert.equal(JSON.stringify(duplicate).includes('SYNTHETIC_OLD_REMINDER_REASON'),false);
 }finally{f.store.close();}
});
test('workday windows respect the actual zone, pre-cutoff time, weekends and a repeated DST hour',async()=>{
 const f=await fixture();try{
  f.setNow('2026-11-17T08:59:59.999Z');assert.equal(f.notifications.briefWindow().due,false);
  f.setNow('2026-11-21T09:00:00Z');assert.equal(f.notifications.briefWindow().due,false);
  f.setPreferences({timeZone:'America/New_York',time:'01:30:00',weekdays:[7],revision:2});f.setNow('2026-11-01T05:30:00Z');
  await f.notifications.save(f.binding,f.input);const first=f.notifications.briefWindow();assert.equal(first.date,'2026-11-01');assert.equal(first.due,true);
  const a=await f.notifications.createBrief(f.binding,{requestId:'dst-first',windowKey:first.key,summary:'One local-date brief'});
  f.setNow('2026-11-01T06:30:00Z');assert.equal(f.notifications.briefWindow().key,first.key);const b=await f.notifications.createBrief(f.binding,{requestId:'dst-second',windowKey:first.key,summary:'Repeated wall-clock hour'});assert.equal(a.notice?.id,b.notice?.id);
  for(const p of [{timeZone:'Invalid/Synthetic',time:'17:00:00',weekdays:[1]},{timeZone:'UTC',time:'24:00:00',weekdays:[1]},{timeZone:'UTC',time:'17:00:00',weekdays:[1,1]}]){f.setPreferences(p);assert.throws(()=>f.notifications.briefWindow(),{code:'notification_invalid'});}
 }finally{f.store.close();}
});
test('same-issue exact repeats create no material revision while independent operating choices cannot be merged',async()=>{
 const f=await fixture();try{
  const first=await f.notifications.save(f.binding,f.input);const same=await f.notifications.save(f.binding,{...f.input,id:first.id,expectedRevision:1,requestId:'same-prose'});assert.equal(same.revision,1);assert.equal(f.notifications.history().length,1);
  const d1=await pendingDecision(f,'one-choice'),d2=await pendingDecision(f,'different-choice');const dref={id:d1.id,revision:1};const matter=await f.notifications.save(f.binding,{...f.input,requestId:'choice-matter',kind:'decision',decision:dref});
  await assert.rejects(f.notifications.save(f.binding,{...f.input,id:matter.id,expectedRevision:1,requestId:'bad-merge',kind:'decision',decision:{id:d2.id,revision:1}}),{code:'notification_distinct_decision'});
  assert.equal(f.decisions.get(d1.id)?.status,'pending');assert.equal(f.decisions.get(d2.id)?.status,'pending');
 }finally{f.store.close();}
});
test('withdrawal or a new matter revision masks the entire cached brief and its old Agent summary',async()=>{
 const f=await fixture();try{
  const first=await f.notifications.save(f.binding,{...f.input,summary:'SYNTHETIC_OLD_MATTER'});const brief=await f.notifications.createBrief(f.binding,{requestId:'initial-brief',windowKey:f.notifications.briefWindow().key,summary:'SYNTHETIC_OLD_BRIEF'});assert.ok(brief.notice);
  await f.notifications.save(f.binding,{...f.input,id:first.id,expectedRevision:1,requestId:'updated',summary:'New qualified matter',changes:['A genuine change']});
  let projected=f.notifications.projection();assert.equal(projected.briefs[0].qualification,'unavailable');assert.equal(JSON.stringify(projected).includes('SYNTHETIC_OLD_'),false);
  f.setEpoch(1);projected=f.notifications.projection();assert.equal(projected.matters.length,0);assert.equal(JSON.stringify(projected).includes('New qualified matter'),false);
  assert.equal((await f.notifications.currentList({...f.binding,epoch:1})).length,0);
  await assert.rejects(f.notifications.read({...f.binding,epoch:1},{id:first.id,revision:1}),{code:'notification_stale'});
  await assert.rejects(f.notifications.save(f.binding,f.input),{code:'notification_unqualified'});
  assert.equal(f.notifications.history()[0].summary,'SYNTHETIC_OLD_MATTER');
 }finally{f.store.close();}
});
test('source verification failures and an async qualification race expose no body and commit no notice',async()=>{
 const f=await fixture();try{
  const first=await f.notifications.save(f.binding,f.input);f.setVerifier(async()=>{throw Error('SYNTHETIC_SENSITIVE_DIAGNOSTIC');});
  await assert.rejects(f.notifications.read(f.binding,{id:first.id,revision:1}),(e:unknown)=>{assert.equal((e as {code:string}).code,'notification_evidence_unavailable');assert.equal(String(e).includes('SYNTHETIC_SENSITIVE_DIAGNOSTIC'),false);return true;});
  let release!:(v:ArtifactRevision)=>void;f.setVerifier(async()=>new Promise(r=>{release=r;}));const pending=f.notifications.save(f.binding,{...f.input,requestId:'racing'});f.setCurrent(false);release(f.artifact);await assert.rejects(pending,{code:'notification_unqualified'});assert.equal(f.notifications.history().length,1);
 }finally{f.store.close();}
});
test('a new qualified matter arriving during brief verification cannot be silently omitted',async()=>{
 const f=await fixture();try{
  await f.notifications.save(f.binding,f.input);let release!:(v:ArtifactRevision)=>void;f.setVerifier(async()=>new Promise(r=>{release=r;}));
  const pending=f.notifications.createBrief(f.binding,{requestId:'racing-brief',windowKey:f.notifications.briefWindow().key,summary:'Must cover every current changed matter'});
  f.restoreVerifier();await f.notifications.save(f.binding,{...f.input,requestId:'arrived-during-check',title:'Second distinct issue'});release(f.artifact);
  await assert.rejects(pending,{code:'notification_stale'});assert.equal(f.notifications.projection().briefs.length,0);assert.equal(f.notifications.projection().checkState,null);
  const retry=await f.notifications.createBrief(f.binding,{requestId:'retry-current',windowKey:f.notifications.briefWindow().key,summary:'Both current issues'});assert.equal(retry.notice?.refs.length,2);
 }finally{f.store.close();}
});
test('Host scope, main role and active lifecycle gate dispatch without inventing adoption or recipients',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.notifications.save({...f.binding,owner:{...owner,principalId:'foreign'}},f.input),{code:'notification_scope'});
  await assert.rejects(f.notifications.save({...f.binding,role:'worker',assignmentId:'worker'},f.input),{code:'notification_role'});
  await assert.rejects(f.notifications.save(f.binding,{...f.input,receiver:{principalId:'outside'}} as SaveNotification),{code:'notification_invalid'});
  const v=await f.notifications.save(f.binding,{...f.input,urgency:'immediate',immediateReason:'Supported immediate need'});f.store.requestLifecycle(owner,f.d.id,{expectedVersion:1,idempotencyKey:'pause',action:'pause'});
  await assert.rejects(f.notifications.immediate(f.binding,{id:v.id,revision:1,requestId:'paused'}),{code:'notification_unqualified'});assert.equal(f.notifications.projection().notices.length,0);assert.equal(f.notifications.briefWindow().due,false);
 }finally{f.store.close();}
});
test('SQLite reopen preserves exact matter, brief and immediate identities with no repeated delivery',async()=>{
 mkdirSync(resolve('.local/tests'),{recursive:true});const dir=mkdtempSync(join(resolve('.local/tests'),'notifications-reopen-')),filename=join(dir,'business.sqlite');const f=await fixture(filename);
 const matter=await f.notifications.save(f.binding,{...f.input,urgency:'immediate',immediateReason:'A supported critical change'});const sent=await f.notifications.immediate(f.binding,{id:matter.id,revision:1,requestId:'immediate'});const brief=await f.notifications.createBrief(f.binding,{requestId:'brief',windowKey:f.notifications.briefWindow().key,summary:'One current issue'});f.store.close();
 const g=await fixture(filename);try{assert.equal(g.notifications.history()[0].id,matter.id);assert.equal((await g.notifications.immediate(g.binding,{id:matter.id,revision:1,requestId:'immediate'})).id,sent.id);assert.equal((await g.notifications.createBrief(g.binding,{requestId:'brief',windowKey:g.notifications.briefWindow().key,summary:'One current issue'})).notice?.id,brief.notice?.id);assert.equal(g.notifications.projection().notices.length,1);assert.equal(g.notifications.projection().briefs.length,1);}finally{g.store.close();rmSync(dir,{recursive:true,force:true});}
});
test('two real SQLite connections cannot revise one matter against the same expected version',async()=>{
 mkdirSync(resolve('.local/tests'),{recursive:true});const dir=mkdtempSync(join(resolve('.local/tests'),'notifications-cas-')),filename=join(dir,'business.sqlite');const f=await fixture(filename),g=await fixture(filename);
 try{const v=await f.notifications.save(f.binding,f.input);const base={...f.input,id:v.id,expectedRevision:1};const results=await Promise.allSettled([f.notifications.save(f.binding,{...base,requestId:'left',summary:'Left exact revision'}),g.notifications.save(g.binding,{...base,requestId:'right',summary:'Right exact revision'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.notifications.history().length,2);assert.equal(g.notifications.history().length,2);}finally{f.store.close();g.store.close();rmSync(dir,{recursive:true,force:true});}
});
test('a racing brief replay cannot reuse one request identity for different Agent summaries',async()=>{
 const f=await fixture();try{
  await f.notifications.save(f.binding,f.input);const windowKey=f.notifications.briefWindow().key;await f.notifications.createBrief(f.binding,{requestId:'initial',windowKey,summary:'Initial summary'});
  let release!:(v:ArtifactRevision)=>void;f.setVerifier(async()=>new Promise(r=>{release=r;}));
  const racing=f.notifications.createBrief(f.binding,{requestId:'same-key',windowKey,summary:'First exact request'});
  f.restoreVerifier();await f.notifications.createBrief(f.binding,{requestId:'same-key',windowKey,summary:'A different exact request'});release(f.artifact);
  await assert.rejects(racing,{code:'notification_conflict'});assert.equal(f.notifications.projection().briefs.length,1);
 }finally{f.store.close();}
});
