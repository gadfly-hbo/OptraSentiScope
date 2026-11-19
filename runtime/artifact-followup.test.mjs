import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

async function boot({store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'artifact-engineering',principalId:'operator'},failSchedule=false,blockKnownStop=false,grants}={}){
 const opened=[],delivered=[],schedules=[],effects={scheduleAttempts:0,refreshes:0,blockKnownStop};
 const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,
  async deliver(message){delivered.push({binding,...message});return{accepted:true,messageId:message.id};},cancel(){},async whenIdle(){},async dispose(){},
  async createSchedule(request){effects.scheduleAttempts++;if(failSchedule&&request.title==='委托观察复查')throw Error('SYNTHETIC_SCHEDULE_RECEIPT_UNKNOWN');const row={id:`owned-${schedules.length}`,target:{kind:'session',sessionId:options.sessionId},status:'active',...request};schedules.push(row);return row;},
  async disableSchedule(id){if(effects.blockDisable)await effects.blockDisable;if(schedules.find(x=>x.id===id)?.title==='委托观察复查'&&effects.blockKnownStop)throw Error('SYNTHETIC_STOP_NOT_CONFIRMED');const row=schedules.find(x=>x.id===id);if(row)row.status='paused';},async listSchedules(){return schedules.filter(x=>x.target.sessionId===options.sessionId);},async refreshSchedules(){effects.refreshes++;}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const c=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic-local',model:'never-externally-called'},notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},grants});
 const d=store.list(owner)[0]??store.create(owner,{goal:'持续跟进合成工程条件变化',idempotencyKey:'create'});await c.sync(d.id);
 const main=()=>opened.filter(x=>x.binding.role==='main').at(-1);
 const invoke=(run,name,args)=>{const tool=run.options.tools.find(t=>t.name===name);assert.ok(tool,`Agent must be offered ${name}`);return tool.execute(args,{signal:new AbortController().signal});};
 return {store,owner,c,d,opened,delivered,schedules,effects,main,invoke,async close(){await c.close();store.close();}};
}
const judgment={kind:'judgment',title:'有限工程判断',summary:'合成资料未给出充分因果证据',evidence:[],assumptions:['仅适用于工程夹具'],unknowns:['真实经营效果未知'],applicability:'当前合成委托',invalidatedBy:['出现反证']};

test('main Agent can publish and read exact immutable artifact versions under its current binding',async()=>{
 const f=await boot();try{
  const v1=await f.invoke(f.main(),'publish_artifact',{requestId:'artifact-one',expectedVersion:0,reason:'初次有限判断',content:judgment});
  const v2=await f.invoke(f.main(),'publish_artifact',{requestId:'artifact-two',artifactId:v1.artifactId,expectedVersion:1,reason:'新增反证后的修正',content:{...judgment,summary:'修订后的有限判断'}});
  assert.equal(v2.version,2);const old=await f.invoke(f.main(),'read_artifact',{artifactId:v1.artifactId,version:1});assert.equal(old.content.summary,'合成资料未给出充分因果证据');
  const current=await f.invoke(f.main(),'read_artifact',{artifactId:v2.artifactId,version:2});assert.equal(current.content.summary,'修订后的有限判断');
  assert.equal(f.c.detail(f.d.id).artifactRevisions.length,2);
 }finally{await f.close();}
});

async function lifecycle(f,action){const d=f.store.get(f.owner,f.d.id);const requested=f.store.requestLifecycle(f.owner,d.id,{action,expectedVersion:d.version,idempotencyKey:`${action}-${d.version}`});const operation=requested.pendingOperation;const receipt=await f.c.controlPort.settle({owner:f.owner,delegation:requested,operation,isCurrent:()=>true});f.store.completeLifecycle(f.owner,d.id,{operationId:operation.id,expectedVersion:operation.requestedVersion,...receipt});await f.c.sync(d.id);return receipt;}
test('pause and resume preserve an observation while a new artifact revision supersedes its timer',async()=>{
 const f=await boot();try{
  const v1=await f.invoke(f.main(),'publish_artifact',{requestId:'first',expectedVersion:0,reason:'初次观察',content:judgment});
  const followup=await f.invoke(f.main(),'arrange_followup',{requestId:'future',artifact:{artifactId:v1.artifactId,version:1},reason:'保留可恢复的观察',dependencies:[],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}});
  const old=f.main();assert.equal((await lifecycle(f,'pause')).outcome,'stopped');assert.equal(f.c.detail(f.d.id).followups[0].status,'waiting');assert.equal(f.c.detail(f.d.id).followups[0].schedule.status,'stopped');
  await lifecycle(f,'resume');assert.notEqual(f.main().handle.sessionId,old.handle.sessionId);assert.equal(f.c.detail(f.d.id).followups[0].schedule.status,'active');
  await assert.rejects(f.invoke(old,'read_artifact',{artifactId:v1.artifactId,version:1}),{code:'stale_research_binding'});
  await f.invoke(f.main(),'publish_artifact',{artifactId:v1.artifactId,expectedVersion:1,requestId:'second',reason:'新版本取代旧观察安排',content:{...judgment,summary:'明确新的有限判断'}});await f.c.sync(f.d.id);
  assert.equal(f.c.detail(f.d.id).followups.find(x=>x.id===followup.id).status,'superseded');assert.equal(f.c.detail(f.d.id).followups[0].schedule.status,'stopped');
 }finally{await f.close();}
});

test('an unknown native observation Schedule is not recreated or reported as stopped',async()=>{
 const f=await boot({failSchedule:true});try{
  const artifact=await f.invoke(f.main(),'publish_artifact',{requestId:'first',expectedVersion:0,reason:'先交付判断',content:judgment});
  await assert.rejects(f.invoke(f.main(),'arrange_followup',{requestId:'unknown',artifact:{artifactId:artifact.artifactId,version:1},reason:'观察创建回执未知',dependencies:[],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}}),{code:'followup_schedule_unknown'});
  assert.equal(f.c.detail(f.d.id).researchStatus.status,'unknown');const attempts=f.effects.scheduleAttempts;
  for(let i=0;i<2;i++)await f.c.sync(f.d.id).catch(()=>{});assert.equal(f.effects.scheduleAttempts,attempts);
  await assert.rejects(lifecycle(f,'pause'));assert.equal(f.store.get(f.owner,f.d.id).lifecycle,'pausing');
 }finally{await f.c.close().catch(()=>{});f.store.close();}
});

test('Agent observation creates an owned native one-shot and declines only unneeded scheduled steps',async()=>{
 const f=await boot();try{
  const artifact=await f.invoke(f.main(),'publish_artifact',{requestId:'first',expectedVersion:0,reason:'观察前交付',content:judgment});
  const at=new Date(Date.now()+60000).toISOString();
  const planned=await f.invoke(f.main(),'arrange_followup',{requestId:'review-later',artifact:{artifactId:artifact.artifactId,version:1},reason:'等待新观察窗口，不重复推断',dependencies:['后续获准资料'],trigger:{kind:'at',at}});
  assert.equal(planned.status,'waiting');assert.equal(f.schedules.at(-1).timing.kind,'at');
  assert.equal(await f.main().options.beforeStep(f.main().binding,{turn:3,step:1,scheduledOnly:true}),false);
  assert.notEqual(await f.main().options.beforeStep(f.main().binding,{turn:3,step:2,scheduledOnly:false}),false);
  assert.equal(f.c.detail(f.d.id).followups[0].reason,'等待新观察窗口，不重复推断');
 }finally{await f.close();}
});

test('a source event preserves the old observation cause and continues through a fresh qualified revision',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-artifact-event-')),file=join(directory,'facts.txt');writeFileSync(file,'SYNTHETIC_FIRST_SOURCE');
 const f=await boot();try{
  f.c.configureSources(f.d.id,[{sourceId:'synthetic-input',directory,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true}]);await f.c.sync(f.d.id);
  const first=f.main(),sources=await f.invoke(first,'list_sources',{}),evidence=sources.references.map(({ref,hash})=>({ref,hash}));
  const v1=await f.invoke(first,'publish_artifact',{requestId:'first',expectedVersion:0,reason:'原准确资料上的有限判断',content:{...judgment,summary:'SYNTHETIC_OLD_ARTIFACT_BODY',evidence}});
  const observation=await f.invoke(first,'arrange_followup',{requestId:'event',artifact:{artifactId:v1.artifactId,version:1},reason:'新资料出现时核对',dependencies:[],trigger:{kind:'source_event',sourceIds:['synthetic-input']}});
  assert.equal(await first.options.beforeStep(first.binding,{turn:4,step:1,scheduledOnly:true}),false);
  writeFileSync(file,'SYNTHETIC_SECOND_SOURCE');await f.c.sync(f.d.id);const fresh=f.main();assert.ok(fresh.binding.epoch>first.binding.epoch);
  const prior=f.c.detail(f.d.id).followups.find(x=>x.id===observation.id);assert.equal(prior.dueCause.kind,'source_event');assert.equal(prior.status,'superseded');
  const exactOld=await f.invoke(fresh,'read_artifact',{artifactId:v1.artifactId,version:1});assert.equal(exactOld.content.summary,'SYNTHETIC_OLD_ARTIFACT_BODY');assert.equal(exactOld.epoch,first.binding.epoch);assert.notEqual(exactOld.epoch,fresh.binding.epoch);
  const metadata=await f.invoke(fresh,'list_artifacts',{});assert.equal(JSON.stringify(metadata).includes('SYNTHETIC_OLD_ARTIFACT_BODY'),false);
  const current=(await f.invoke(fresh,'list_sources',{})).references.filter(r=>r.hash!==evidence[0].hash).map(({ref,hash})=>({ref,hash}));
  const v2=await f.invoke(fresh,'publish_artifact',{requestId:'second',artifactId:v1.artifactId,expectedVersion:1,reason:'当前新资料上的关联修订；不重放旧epoch正文',content:{...judgment,summary:'SYNTHETIC_NEW_ARTIFACT_BODY',evidence:current}});
  assert.equal(v2.version,2);assert.equal(f.c.detail(f.d.id).artifactRevisions[0].content.summary,'SYNTHETIC_OLD_ARTIFACT_BODY');
  await assert.rejects(f.invoke(first,'publish_artifact',{requestId:'late',artifactId:v1.artifactId,expectedVersion:2,reason:'旧会话迟到',content:judgment}),{code:'stale_research_binding'});
 }finally{await f.close();rmSync(directory,{recursive:true,force:true});}
});

test('business-store cold reopen retains the exact known Schedule mapping without another creation',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-artifact-cold-')),filename=join(directory,'business.sqlite');const first=await boot({store:new SentiStore({filename})});let restored;
 try{
  const revision=await first.invoke(first.main(),'publish_artifact',{requestId:'cold-artifact',expectedVersion:0,reason:'异常重开前的版本',content:judgment});
  const observation=await first.invoke(first.main(),'arrange_followup',{requestId:'cold-observe',artifact:{artifactId:revision.artifactId,version:1},reason:'保存已知原生身份',dependencies:[],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}});
  await first.c.sync(first.d.id);const native=first.main();first.store.close();
  // Simulates the lost process's in-memory port; actual OS/Schedule persistence is covered by the separate SDK recovery probe.
  restored=await boot({store:new SentiStore({filename}),owner:first.owner});assert.equal(restored.main().options.resume,true);assert.equal(restored.main().handle.sessionId,native.handle.sessionId);assert.ok(restored.main().binding.generation>native.binding.generation);
  const saved=restored.c.detail(first.d.id).followups[0];assert.equal(saved.id,observation.id);assert.equal(saved.schedule.id,observation.schedule.id);assert.equal(saved.status,'waiting');assert.equal(restored.effects.scheduleAttempts,0);assert.equal(restored.effects.refreshes,1,'restored active native Schedule configuration is refreshed after handle binding');
  assert.equal((await restored.invoke(restored.main(),'read_artifact',{artifactId:revision.artifactId,version:1})).content.summary,judgment.summary);
 }finally{if(restored)await restored.close();else try{first.store.close();}catch{}rmSync(directory,{recursive:true,force:true});}
});

test('native Schedule resolution scans and invalidates stale input without waiting for Schedule cleanup',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-wake-')),file=join(directory,'facts.txt');writeFileSync(file,'first');const f=await boot();let release,pending;
 try{
  f.c.configureSources(f.d.id,[{sourceId:'wake-source',directory,grantRevision:1,enabled:true}]);await f.c.sync(f.d.id);const old=f.main();
  f.effects.blockDisable=new Promise(resolve=>{release=resolve;});writeFileSync(file,'second');
  pending=f.c.beforeWake({binding:old.binding});let timer;
  try{await Promise.race([pending,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Schedule resolver waited for re-entrant Schedule cleanup')),100);})]);}finally{clearTimeout(timer);}
  assert.equal(f.c.isCurrentBinding(old.binding),false);release();await f.c.sync(f.d.id);assert.ok(f.main().binding.epoch>old.binding.epoch);
 }finally{release?.();await pending?.catch(()=>{});await f.close();rmSync(directory,{recursive:true,force:true});}
});

test('a matching event retains its cause when another source changed earlier in the same scan',async()=>{
 const firstDir=mkdtempSync(join(tmpdir(),'sentiscope-unwatched-')),secondDir=mkdtempSync(join(tmpdir(),'sentiscope-watched-'));writeFileSync(join(firstDir,'facts.txt'),'first A');writeFileSync(join(secondDir,'facts.txt'),'first B');const f=await boot();
 try{
  f.c.configureSources(f.d.id,[{sourceId:'a-other',directory:firstDir,grantRevision:1,enabled:true},{sourceId:'b-watched',directory:secondDir,grantRevision:1,enabled:true}]);await f.c.sync(f.d.id);
  const artifact=await f.invoke(f.main(),'publish_artifact',{requestId:'multi',expectedVersion:0,reason:'等待特定来源',content:judgment});
  const planned=await f.invoke(f.main(),'arrange_followup',{requestId:'watch-b',artifact:{artifactId:artifact.artifactId,version:1},reason:'只记录B的触发原因',dependencies:[],trigger:{kind:'source_event',sourceIds:['b-watched']}});
  writeFileSync(join(firstDir,'facts.txt'),'second A');writeFileSync(join(secondDir,'facts.txt'),'second B');await f.c.sync(f.d.id);
  const saved=f.c.detail(f.d.id).followups.find(x=>x.id===planned.id);assert.equal(saved.dueCause?.sourceId,'b-watched');assert.equal(saved.status,'superseded');
 }finally{await f.close();rmSync(firstDir,{recursive:true,force:true});rmSync(secondDir,{recursive:true,force:true});}
});

test('a later authoritative stop of an exact known Schedule can resolve a prior stop uncertainty',async()=>{
 const f=await boot({blockKnownStop:true});try{
  const artifact=await f.invoke(f.main(),'publish_artifact',{requestId:'stop',expectedVersion:0,reason:'停止恢复前的判断',content:judgment});
  await f.invoke(f.main(),'arrange_followup',{requestId:'stop-observation',artifact:{artifactId:artifact.artifactId,version:1},reason:'仅停止准确已知定时',dependencies:[],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}});
  await assert.rejects(lifecycle(f,'pause'));assert.equal(f.c.detail(f.d.id).researchStatus.status,'pausing');assert.equal(f.c.detail(f.d.id).followups[0].schedule.status,'unknown');
  f.effects.blockKnownStop=false;const requested=f.store.get(f.owner,f.d.id),operation=requested.pendingOperation;
  const receipt=await f.c.controlPort.settle({owner:f.owner,delegation:requested,operation,isCurrent:()=>true});assert.equal(receipt.outcome,'stopped');
  f.store.completeLifecycle(f.owner,f.d.id,{operationId:operation.id,expectedVersion:operation.requestedVersion,...receipt});assert.equal(f.store.get(f.owner,f.d.id).lifecycle,'paused');assert.equal(f.c.detail(f.d.id).followups[0].schedule.status,'stopped');
 }finally{await f.c.close().catch(()=>{});f.store.close();}
});
