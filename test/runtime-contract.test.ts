import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeResearchPort } from '../runtime/native.ts';
import type { RunBinding } from '../runtime/index.ts';
import type { Context } from '@deepseek-ai/cordis';

const binding: RunBinding = { owner: { enterpriseId: 'synthetic-enterprise', principalId: 'synthetic-operator' }, delegationId: 'synthetic-delegation', goalRevision: 1, role: 'main', epoch: 1, generation: 1 };

test('native admission refuses stale ownership before invoking the official factory', async () => {
  let creates = 0;
  const ctx = { on() { return () => {}; }, agents: { async create() { creates += 1; throw new Error('factory must not run'); } } } as unknown as Context;
  const port = createNativeResearchPort(ctx);
  await assert.rejects(port.open(binding, { tools: [], admit: () => false }), /NATIVE_ADMISSION_DENIED/);
  assert.equal(creates, 0);
  await port.dispose();
});

test('native setup commit rechecks current qualification at the publication boundary', async () => {
  let allowed = true;
  let published = false;
  const agent = { session: { firstLiveSeq: 0 } };
  const scoped = { tools: { restrict() {}, register() {} }, on() { return () => {}; } };
  const ctx = {
    on() { return () => {}; },
    agents: { async create(options: { setup: (ctx: unknown, agent: unknown) => { commit(): void } }) {
      const setup = options.setup(scoped, agent);
      allowed = false; // Qualification changes while the native factory is provisioning.
      setup.commit();
      published = true;
      throw new Error('stale handle must never publish');
    } },
  } as unknown as Context;
  const port = createNativeResearchPort(ctx);
  await assert.rejects(port.open(binding, { tools: [], admit: () => allowed }), /NATIVE_ADMISSION_DENIED/);
  assert.equal(published, false);
  await port.dispose();
});

test('unconfigured native handle remains idle and closing prevents later delivery', async () => {
  let followups = 0;
  let disposals = 0;
  const agent = { session: { firstLiveSeq: 0 }, followup() { followups++; }, cancel() {}, async whenIdle() {} };
  const scoped = { tools: { restrict() {}, register() {} }, on() { return () => {}; } };
  const ctx = {
    on() { return () => {}; },
    sessions: { async flush() { return true; } },
    agents: { async create(options: { setup: (ctx: unknown, agent: unknown) => { commit(): void } }) {
      options.setup(scoped, agent).commit();
      return { agent, async dispose() { disposals++; } };
    } },
  } as unknown as Context;
  const port = createNativeResearchPort(ctx);
  const handle = await port.open(binding, { tools: [], admit: () => true });
  assert.equal(handle.configured, false);
  await assert.rejects(handle.refreshSchedules!(), /NATIVE_UNCONFIGURED/);
  await assert.rejects(handle.deliver({ id: 'synthetic-message', text: 'no provider' }), /NATIVE_UNCONFIGURED/);
  assert.equal(followups, 0);
  handle.cancel();
  await assert.rejects(handle.refreshSchedules!(), /NATIVE_ADMISSION_DENIED/);
  await assert.rejects(handle.deliver({ id: 'after-close', text: 'closed' }), /NATIVE_ADMISSION_DENIED/);
  await Promise.all([handle.dispose(), handle.dispose()]);
  assert.equal(disposals, 1);
  await port.dispose();
});

async function scheduleFixture(options:{role?:RunBinding['role'];ids?:readonly string[];onView?:(id:string)=>Promise<void>;editResult?:(row:Record<string,unknown>)=>Record<string,unknown>;onEdit?:()=>Promise<void>}={}) {
  let allowed=true;const viewed:string[]=[];const edits:Array<{request:Record<string,unknown>;actor:string}>=[];
  const rows=new Map<string,Record<string,unknown>>([
    ['heartbeat',{id:'heartbeat',kind:'every',everySeconds:60,prompt:'Exact persisted heartbeat',title:'Heartbeat',scheduledAt:'2026-11-17T00:00:00Z',status:'active',updatedAt:'2026-11-17T00:00:01Z',target:{kind:'session',sessionId:'native-main'}}],
    ['one-shot',{id:'one-shot',kind:'at',at:'2026-11-17T00:00:00Z',prompt:'Exact persisted observation',title:'Observation',scheduledAt:'2026-11-17T00:00:00Z',status:'active',target:{kind:'session',sessionId:'native-main'}}],
    ['paused',{id:'paused',prompt:'Paused original',scheduledAt:'2026-11-17T00:00:00Z',status:'paused',target:{kind:'session',sessionId:'native-main'}}],
    ['ended',{id:'ended',prompt:'Ended original',scheduledAt:'2026-11-17T00:00:00Z',status:'ended',target:{kind:'session',sessionId:'native-main'}}],
    ['unowned',{id:'unowned',prompt:'Never read globally',status:'active',target:{kind:'session',sessionId:'another-session'}}],
  ]);
  const agent={session:{firstLiveSeq:0},cancel(){},async whenIdle(){}};const scoped={tools:{restrict(){},register(){}},on(){return()=>{};}};
  const ctx={on(){return()=>{};},sessions:{async flush(){return true;}},agents:{async resume(input:{setup:(ctx:unknown)=>{commit():void}}){input.setup(scoped).commit();return{agent,async dispose(){}};}},schedule:{
    async view({id}:{id:string}){viewed.push(id);await options.onView?.(id);return rows.get(id)??{id,code:'schedule_not_found'};},
    async edit(request:Record<string,unknown>,actor:string){edits.push({request:structuredClone(request),actor});await options.onEdit?.();const row=rows.get(request.id as string)!;return options.editResult?.(row)??structuredClone(row);},
    async create(){throw new Error('refresh must not create schedules');},async run(){throw new Error('refresh must not manually run schedules');},
  }} as unknown as Context;
  const port=createNativeResearchPort(ctx);const handle=await port.open({...binding,generation:2,role:options.role??'main'},{sessionId:'native-main',resume:true,model:{provider:'synthetic',model:'unused'},tools:[],scheduleIds:options.ids??['heartbeat','one-shot','paused','ended'],admit:()=>allowed});
  return{handle,port,rows,viewed,edits,setAllowed(value:boolean){allowed=value;}};
}

test('restored native main re-drives only its exact active Schedule IDs with unchanged prompts and revision CAS',async()=>{
  const f=await scheduleFixture();try{assert.equal(typeof f.handle.refreshSchedules,'function');await f.handle.refreshSchedules!();assert.deepEqual(f.viewed,['heartbeat','one-shot','paused','ended']);assert.deepEqual(f.edits,[
    {request:{id:'heartbeat',action:'update',expectedUpdatedAt:'2026-11-17T00:00:01Z',patch:{prompt:'Exact persisted heartbeat'}},actor:'native-main'},
    {request:{id:'one-shot',action:'update',expectedUpdatedAt:null,patch:{prompt:'Exact persisted observation'}},actor:'native-main'},
  ]);assert.equal(f.rows.get('heartbeat')?.scheduledAt,'2026-11-17T00:00:00Z');assert.equal(f.rows.get('one-shot')?.scheduledAt,'2026-11-17T00:00:00Z');}finally{await f.port.dispose();}
});

test('Schedule refresh does not activate paused or ended tasks and a worker or stale owner cannot issue it',async()=>{
  const inactive=await scheduleFixture({ids:['paused','ended']});try{await inactive.handle.refreshSchedules!();assert.deepEqual(inactive.viewed,['paused','ended']);assert.deepEqual(inactive.edits,[]);}finally{await inactive.port.dispose();}
  const worker=await scheduleFixture({role:'worker'});try{await assert.rejects(worker.handle.refreshSchedules!(),/NATIVE_WORKER_SCHEDULE_DENIED/);assert.deepEqual(worker.viewed,[]);assert.deepEqual(worker.edits,[]);}finally{await worker.port.dispose();}
  const stale=await scheduleFixture();try{stale.setAllowed(false);await assert.rejects(stale.handle.refreshSchedules!(),/NATIVE_ADMISSION_DENIED/);assert.deepEqual(stale.viewed,[]);assert.deepEqual(stale.edits,[]);}finally{await stale.port.dispose();}
});

test('missing, wrong-target and CAS-conflicting native mappings remain unconfirmed without creation or manual replay',async()=>{
  for(const wrong of [{id:'heartbeat',code:'schedule_not_found'},{id:'heartbeat',status:'active',target:{kind:'session',sessionId:'another-session'}},{id:'another-id',status:'active',target:{kind:'session',sessionId:'native-main'}}]){
    const f=await scheduleFixture({ids:['heartbeat']});try{f.rows.set('heartbeat',wrong);await assert.rejects(f.handle.refreshSchedules!(),/NATIVE_SCHEDULE_REFRESH_UNCONFIRMED/);assert.deepEqual(f.edits,[]);}finally{await f.port.dispose();}
  }
  const conflict=await scheduleFixture({editResult:()=>({id:'heartbeat',code:'schedule_conflict'})});try{await assert.rejects(conflict.handle.refreshSchedules!(),/NATIVE_SCHEDULE_REFRESH_UNCONFIRMED/);assert.equal(conflict.edits.length,1,'A CAS refusal is not retried');assert.deepEqual(conflict.viewed,['heartbeat','heartbeat'],'The only extra operation is one same-ID verification read');}finally{await conflict.port.dispose();}
});

test('Schedule refresh rechecks qualification after native awaits and never treats a late result as current',async()=>{
  let before:Awaited<ReturnType<typeof scheduleFixture>>;before=await scheduleFixture({onView:async()=>before.setAllowed(false)});try{await assert.rejects(before.handle.refreshSchedules!(),/NATIVE_ADMISSION_DENIED/);assert.deepEqual(before.viewed,['heartbeat']);assert.deepEqual(before.edits,[]);}finally{await before.port.dispose();}
  let after:Awaited<ReturnType<typeof scheduleFixture>>;after=await scheduleFixture({onEdit:async()=>after.setAllowed(false)});try{await assert.rejects(after.handle.refreshSchedules!(),/NATIVE_ADMISSION_DENIED/);assert.equal(after.edits.length,1);assert.deepEqual(after.viewed,['heartbeat'],'Later known tasks are not refreshed after losing this generation');}finally{await after.port.dispose();}
});

test('a successful public refresh accepts same-task native forward progress without writing an old occurrence back',async()=>{
  for(const progress of [{status:'ended',scheduledAt:'2026-11-17T00:00:00Z'},{status:'active',scheduledAt:'2026-11-17T00:01:00Z'}]){
    const f=await scheduleFixture({ids:['heartbeat'],editResult:row=>({...row,...progress})});try{await f.handle.refreshSchedules!();assert.deepEqual(f.edits,[{request:{id:'heartbeat',action:'update',expectedUpdatedAt:'2026-11-17T00:00:01Z',patch:{prompt:'Exact persisted heartbeat'}},actor:'native-main'}]);}finally{await f.port.dispose();}
  }
});

test('a refresh reply never confirms backward time, changed rule, retargeting, changed prompt or an invalid occurrence',async()=>{
  for(const changed of [{scheduledAt:'2026-11-16T23:59:00Z'},{scheduledAt:'unknown'},{kind:'at'},{target:{kind:'session',sessionId:'another-session'}},{prompt:'Different instruction'},{status:'paused'}]){
    const f=await scheduleFixture({ids:['heartbeat'],editResult:row=>({...row,...changed})});try{await assert.rejects(f.handle.refreshSchedules!(),/NATIVE_SCHEDULE_REFRESH_UNCONFIRMED/);assert.equal(f.edits.length,1);assert.deepEqual(f.edits[0].request.patch,{prompt:'Exact persisted heartbeat'});}finally{await f.port.dispose();}
  }
});

test('a native CAS conflict can be resolved by one exact reread proving a newly committed same-task delivery',async()=>{
  for(const id of ['heartbeat','one-shot']){
    let f:Awaited<ReturnType<typeof scheduleFixture>>;f=await scheduleFixture({ids:[id],onEdit:async()=>{const prior=f.rows.get(id)!;f.rows.set(id,{...prior,status:id==='one-shot'?'ended':'active',scheduledAt:id==='one-shot'?'2026-11-17T00:00:00Z':'2026-11-17T00:01:00Z',updatedAt:'2026-11-17T00:00:03Z',lastDelivery:{scheduledAt:'2026-11-17T00:00:00Z',deliveredAt:'2026-11-17T00:00:02Z',messageId:'new-authoritative-message',targetSessionId:'native-main'}});},editResult:()=>({id,code:'schedule_conflict'})});
    try{await f.handle.refreshSchedules!();assert.deepEqual(f.viewed,[id,id]);assert.equal(f.edits.length,1,'Native management is attempted once, never replayed after a conflict');assert.deepEqual(f.edits[0].request.patch,{prompt:id==='one-shot'?'Exact persisted observation':'Exact persisted heartbeat'});}finally{await f.port.dispose();}
  }
});

test('conflict readback without new authoritative same-configuration delivery evidence remains unconfirmed',async()=>{
  const receipt={scheduledAt:'2026-11-17T00:00:00Z',deliveredAt:'2026-11-17T00:00:02Z',messageId:'new-message',targetSessionId:'native-main'};
  const changes:Record<string,unknown>[]=[
    {lastDelivery:undefined},{lastDelivery:{...receipt,messageId:'old-message'}},{lastDelivery:{...receipt,messageId:''}},{lastDelivery:{...receipt,targetSessionId:'another-session'}},
    {lastDelivery:{...receipt,scheduledAt:'2026-11-16T23:59:00Z'}},{lastDelivery:{...receipt,deliveredAt:'unknown'}},
    {status:'paused'},{scheduledAt:'2026-11-16T23:59:00Z'},{scheduledAt:'unknown'},{id:'another-id'},{target:{kind:'session',sessionId:'another-session'}},
    {kind:'at'},{title:'Changed title'},{prompt:'Changed instruction'},{everySeconds:120},{createdAt:'2026-11-16T00:00:00Z'},{involvedSessionIds:['native-main','another-session']},
  ];
  for(const change of changes){
    let f:Awaited<ReturnType<typeof scheduleFixture>>;f=await scheduleFixture({ids:['heartbeat'],onEdit:async()=>{const prior=f.rows.get('heartbeat')!;f.rows.set('heartbeat',{...prior,status:'active',scheduledAt:'2026-11-17T00:01:00Z',updatedAt:'2026-11-17T00:00:03Z',lastDelivery:receipt,...change});},editResult:()=>({id:'heartbeat',code:'schedule_conflict'})});
    f.rows.set('heartbeat',{...f.rows.get('heartbeat'),createdAt:'2026-11-17T00:00:00Z',involvedSessionIds:['native-main'],lastDelivery:{...receipt,scheduledAt:'2026-11-16T23:59:00Z',messageId:'old-message'}});
    try{await assert.rejects(f.handle.refreshSchedules!(),/NATIVE_SCHEDULE_REFRESH_UNCONFIRMED/);assert.deepEqual(f.viewed,['heartbeat','heartbeat']);assert.equal(f.edits.length,1,'Evidence failure never triggers another edit');}finally{await f.port.dispose();}
  }
  let one:Awaited<ReturnType<typeof scheduleFixture>>;one=await scheduleFixture({ids:['one-shot'],onEdit:async()=>{one.rows.set('one-shot',{...one.rows.get('one-shot'),status:'ended',scheduledAt:'2026-11-17T00:01:00Z',lastDelivery:receipt});},editResult:()=>({id:'one-shot',code:'schedule_conflict'})});
  try{await assert.rejects(one.handle.refreshSchedules!(),/NATIVE_SCHEDULE_REFRESH_UNCONFIRMED/);assert.equal(one.edits.length,1,'A one-shot occurrence cannot be retimed under a receipt');}finally{await one.port.dispose();}
});

test('conflict verification stays within the exact task identity and rechecks qualification after its only read',async()=>{
  const wrong=await scheduleFixture({ids:['heartbeat'],editResult:()=>({id:'foreign-task',code:'schedule_conflict'})});try{await assert.rejects(wrong.handle.refreshSchedules!(),/NATIVE_SCHEDULE_REFRESH_UNCONFIRMED/);assert.deepEqual(wrong.viewed,['heartbeat']);assert.equal(wrong.edits.length,1);}finally{await wrong.port.dispose();}
  let count=0;let f:Awaited<ReturnType<typeof scheduleFixture>>;f=await scheduleFixture({ids:['heartbeat'],onView:async()=>{if(++count===2)f.setAllowed(false);},onEdit:async()=>{f.rows.set('heartbeat',{...f.rows.get('heartbeat'),status:'active',scheduledAt:'2026-11-17T00:01:00Z',lastDelivery:{scheduledAt:'2026-11-17T00:00:00Z',deliveredAt:'2026-11-17T00:00:02Z',messageId:'new-message',targetSessionId:'native-main'}});},editResult:()=>({id:'heartbeat',code:'schedule_conflict'})});
  try{await assert.rejects(f.handle.refreshSchedules!(),/NATIVE_ADMISSION_DENIED/);assert.deepEqual(f.viewed,['heartbeat','heartbeat']);assert.equal(f.edits.length,1);}finally{await f.port.dispose();}
});
