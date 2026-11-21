import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

const marker='RESTART_MISSING_SESSION';
function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-restart-missing-')),sourceDirectory=join(directory,'source');mkdirSync(sourceDirectory);writeFileSync(join(sourceDirectory,'fact.txt'),marker);
 const store=new SentiStore({filename:join(directory,'business.sqlite')}),owner={enterpriseId:'restart-missing',principalId:'operator'};
 return {directory,sourceDirectory,store,owner};
}
function native(sessions,{failResume}={}){
 const opened=[];
 return {opened,async open(binding,options){
  if(options.resume){
   if(failResume?.(binding,options))throw Object.assign(new Error('native resume failed'),{name:'NativeResumeFailure'});
   if(!sessions.has(options.sessionId))throw Object.assign(new Error(`session "${options.sessionId}" not found`),{name:'SessionPersistenceNotFoundError'});
  }else sessions.add(options.sessionId);
  const handle={binding,sessionId:options.sessionId,configured:true,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},interrupt(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${opened.length}-${Math.random()}`,...request};},async disableSchedule(){},async listSchedules(){return[];}};
  opened.push({binding,options,handle});return handle;
 },async dispose(){}};
}
async function createDelegation(store,owner,coordinator,sourceDirectory,idempotencyKey){
 const id=store.create(owner,{goal:`Restart ${idempotencyKey}`,boundary:'Synthetic only',idempotencyKey}).id;
 coordinator.configureSources(id,[{sourceId:'shared',directory:sourceDirectory,grantRevision:1,enabled:true}]);await coordinator.sync(id);return id;
}
const runs=(store,id)=>store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=? ORDER BY generation').all(id).map(r=>JSON.parse(r.value));
const facts=(store,id)=>store.connection.prepare('SELECT kind FROM research_facts WHERE delegation_id=?').all(id).map(r=>r.kind);

test('a run row committed before the first session flush recovers on restart instead of locking out startup',async()=>{
 const {directory,sourceDirectory,store,owner}=fixture();
 const sessions=new Set(),first=native(sessions),coordinator=new ResearchCoordinator({store,owner,native:first,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60});
 try{
  const id=await createDelegation(store,owner,coordinator,sourceDirectory,'missing');
  const prior=runs(store,id).filter(r=>r.binding.role==='main').at(-1);assert.equal(prior.state,'current');assert.ok(sessions.has(prior.sessionId));
  await coordinator.close();
  // Simulate a crash after the run row committed but before heartbeat/first session flush: no schedule, no JSONL.
  sessions.clear();
  const crashed={...prior,schedules:[],state:'current'};delete crashed.scheduleState;delete crashed.heartbeat;delete crashed.contextDelivered;
  store.connection.prepare('UPDATE research_runs SET value=? WHERE key=? AND generation=?').run(JSON.stringify(crashed),prior.key,prior.binding.generation);
  const restartSessions=new Set(),second=native(restartSessions),restarted=new ResearchCoordinator({store,owner,native:second,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60});
  try{
   await restarted.start();
   const after=runs(store,id).filter(r=>r.binding.role==='main').at(-1);
   assert.equal(after.state,'current');assert.notEqual(after.sessionId,prior.sessionId);assert.ok(restartSessions.has(after.sessionId));
   const kinds=facts(store,id);assert.ok(kinds.includes('native_session_missing')||kinds.includes('native_session_missing_retire'),`expected missing-session fact, got ${kinds.join(',')}`);
   assert.ok(second.opened.some(run=>run.binding.role==='main'&&!run.options.resume));
  }finally{await restarted.close();}
 }finally{await coordinator.close().catch(()=>{});store.close();rmSync(directory,{recursive:true,force:true});}
});

test('a missing session with a recorded heartbeat Schedule stays fail-closed isolated while startup continues',async()=>{
 const {directory,sourceDirectory,store,owner}=fixture();
 const sessions=new Set(),first=native(sessions),coordinator=new ResearchCoordinator({store,owner,native:first,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60});
 try{
  const id=await createDelegation(store,owner,coordinator,sourceDirectory,'orphan');
  const prior=runs(store,id).filter(r=>r.binding.role==='main').at(-1);assert.ok(prior.schedules.length>0,'heartbeat Schedule must be recorded');
  await coordinator.close();
  // R1 real lockout field: run row unknown with a heartbeat Schedule but the session JSONL never flushed.
  sessions.clear();
  store.connection.prepare('UPDATE research_runs SET value=? WHERE key=? AND generation=?').run(JSON.stringify({...prior,state:'unknown'}),prior.key,prior.binding.generation);
  const second=native(new Set()),restarted=new ResearchCoordinator({store,owner,native:second,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60});
  try{
   await restarted.start();
   const after=runs(store,id).filter(r=>r.binding.role==='main').at(-1);
   assert.equal(after.state,'unknown','orphan Schedule must not be silently retired or auto-recreated');
   assert.ok(facts(store,id).includes('reconcile_failed'));
   assert.ok(!second.opened.some(run=>run.binding.delegationId===id&&!run.options.resume),'no blind fresh session for an orphan-Schedule delegation');
  }finally{await restarted.close();}
 }finally{await coordinator.close().catch(()=>{});store.close();rmSync(directory,{recursive:true,force:true});}
});

test('startup reconciliation isolates a failing delegation and still starts the others',async()=>{
 const {directory,sourceDirectory,store,owner}=fixture();
 const sessions=new Set(),first=native(sessions),coordinator=new ResearchCoordinator({store,owner,native:first,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60});
 try{
  const bad=await createDelegation(store,owner,coordinator,sourceDirectory,'bad');
  const good=await createDelegation(store,owner,coordinator,sourceDirectory,'good');
  const badSession=runs(store,bad).filter(r=>r.binding.role==='main').at(-1).sessionId;
  await coordinator.close();
  for(const id of [bad,good]){const row=runs(store,id).filter(r=>r.binding.role==='main').at(-1);store.connection.prepare('UPDATE research_runs SET value=? WHERE key=? AND generation=?').run(JSON.stringify({...row,state:'current'}),row.key,row.binding.generation);}
  const second=native(sessions,{failResume:(_b,o)=>o.sessionId===badSession}),restarted=new ResearchCoordinator({store,owner,native:second,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60});
  try{
   await restarted.start();
   assert.ok(facts(store,bad).includes('reconcile_failed'));
   assert.ok(second.opened.some(run=>run.binding.delegationId===good));
   assert.equal(runs(store,good).filter(r=>r.binding.role==='main').at(-1).state,'current');
  }finally{await restarted.close();}
 }finally{await coordinator.close().catch(()=>{});store.close();rmSync(directory,{recursive:true,force:true});}
});