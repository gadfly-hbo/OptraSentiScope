import{test}from'node:test';
import assert from'node:assert/strict';
import{SentiStore}from'../src/store.ts';
import{HostControls}from'./controls.ts';
const owner={enterpriseId:'controls-engineering',principalId:'operator'};
function fixture(){const store=new SentiStore({filename:':memory:'});const d=store.create(owner,{goal:'Engineering boundary only',idempotencyKey:'create'});const binding={owner,delegationId:d.id,goalRevision:1,role:'main',epoch:0,generation:1};return {store,d,binding};}
test('no configured resource/egress authority reaches an adapter',async()=>{
 const f=fixture();let dispatches=0;const c=new HostControls({store:f.store,owner,isCurrent:()=>true,verifyInput:async()=>{},halt:()=>{},credentialRecords:{async readRecord(){return undefined;},async modifyRecord(){return undefined;}},localModelRoutes:[{provider:'engineering-local',model:'fixture'}]});
 try{await assert.rejects(async()=>{for await(const _ of c.stream({binding:f.binding,sessionId:'owned'}, {sessionId:'owned',provider:'engineering-local',model:'fixture',maxTokens:8,messages:[]},async function*(){dispatches++;yield {type:'finish',reason:{kind:'stop'}};})){};},{code:'egress_denied'});assert.equal(dispatches,0);}finally{f.store.close();}
});
function setup(options={}){
 const f=fixture();let current=true;const halted=[];const c=new HostControls({store:f.store,owner,isCurrent:()=>current,verifyInput:async()=>{},halt:(_b,code)=>halted.push(code),credentialRecords:{async readRecord(){return undefined;},async modifyRecord(){return undefined;}},modelSelection:{provider:'engineering-local',model:'fixture',maxTokens:8},localModelRoutes:[{provider:'engineering-local',model:'fixture'}],...options});
 c.configureModelEgress(f.d.id,{revision:1,enabled:true,provider:'engineering-local',model:'fixture',maxTokens:8});c.configureBudget(f.d.id,{revision:1,limits:{modelRequests:2,outputTokens:16,computeMilliseconds:0},expiresAt:new Date(Date.now()+3600000).toISOString()});
 const request={sessionId:'owned',provider:'engineering-local',model:'fixture',maxTokens:8,messages:[]};return {...f,c,request,halted,revoke(){current=false;}};
}
async function collect(stream){const chunks=[];for await(const c of stream)chunks.push(c);return chunks;}
test('last reserved slot finishes, charges actual output once, then another stream is denied before dispatch',async()=>{
 const f=setup();let dispatches=0;try{f.c.configureBudget(f.d.id,{revision:2,limits:{modelRequests:1,outputTokens:8,computeMilliseconds:0},expiresAt:new Date(Date.now()+3600000).toISOString()});
 const next=async function*(){dispatches++;assert.equal(f.c.budget(f.d.id).snapshot().held.outputTokens,8);yield{type:'usage',usage:{inputTokens:4,outputTokens:2,totalTokens:6,reasoningTokens:1}};yield{type:'finish',reason:{kind:'stop'}};};
 await collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,next));const snap=f.c.budget(f.d.id).snapshot();assert.deepEqual(snap.used,{modelRequests:1,outputTokens:2,computeMilliseconds:0});assert.equal(snap.held.outputTokens,0);assert.equal(snap.unknownCount,0);
 await assert.rejects(collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,next)),{code:'budget_exhausted'});assert.equal(dispatches,1);
 }finally{f.c.close();f.store.close();}
});
test('missing usage keeps the full reservation across later work without treating it as free',async()=>{
 const f=setup();try{await collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){yield{type:'finish',reason:{kind:'stop'}};}));const snap=f.c.budget(f.d.id).snapshot();assert.equal(snap.unknownCount,1);assert.deepEqual(snap.held,{modelRequests:1,outputTokens:8,computeMilliseconds:0});assert.equal(snap.used.outputTokens,0);
 }finally{f.c.close();f.store.close();}
});
test('source or egress revocation stops subsequent output and preserves uncertain charge',async()=>{
 const f=setup();try{await assert.rejects(collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){yield{type:'text-delta',index:0,text:'approved'};f.c.configureModelEgress(f.d.id,{revision:2,enabled:false,provider:'engineering-local',model:'fixture',maxTokens:8});yield{type:'text-delta',index:0,text:'MUST_NOT_PASS'};})),{code:'egress_changed'});assert.equal(f.c.budget(f.d.id).snapshot().unknownCount,1);assert.ok(f.halted.includes('egress_changed'));
 }finally{f.c.close();f.store.close();}
});
test('untrusted errors are reduced to fixed codes and defaults never reset existing consumption',async()=>{
 const f=setup({defaults:{budget:{limits:{modelRequests:9,outputTokens:900,computeMilliseconds:0},durationMs:3600000}}});try{
 await assert.rejects(collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){throw new Error('SYNTHETIC_PRIVATE_ERROR_VALUE');})),e=>e.code==='host_resource_unconfirmed'&&!String(e).includes('SYNTHETIC_PRIVATE_ERROR_VALUE'));
 f.c.ensureDefaults(f.d.id);assert.equal(f.c.budget(f.d.id).snapshot().config.revision,1);assert.equal(f.c.budget(f.d.id).snapshot().held.outputTokens,8);assert.equal(f.c.canStart(f.d.id),false);
 }finally{f.c.close();f.store.close();}
});
test('per-request allowance checks do not cancel another legitimately reserved request',async()=>{
 const f=setup();let release;const barrier=new Promise(r=>release=r);try{
 const a=collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){await barrier;yield{type:'usage',usage:{inputTokens:1,outputTokens:1}};yield{type:'finish',reason:{kind:'stop'}};}));
 await new Promise(r=>setImmediate(r));await collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){yield{type:'usage',usage:{inputTokens:1,outputTokens:1}};yield{type:'finish',reason:{kind:'stop'}};}));release();await a;
 assert.equal(f.c.budget(f.d.id).snapshot().used.modelRequests,2);assert.equal(f.halted.length,0);
 }finally{release?.();f.c.close();f.store.close();}
});
test('late authoritative usage settles its original reservation after qualification withdrawal without forwarding later content',async()=>{
 const f=setup(),seen=[];try{await assert.rejects(async()=>{for await(const chunk of f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){yield{type:'text-delta',index:0,text:'before-withdrawal'};f.revoke();yield{type:'text-delta',index:0,text:'AFTER_WITHDRAWAL_MUST_NOT_PASS'};yield{type:'usage',usage:{inputTokens:4,outputTokens:3,totalTokens:7}};yield{type:'finish',reason:{kind:'stop'}};}))seen.push(chunk);},{code:'stale_egress_binding'});
 assert.deepEqual(seen.map(c=>c.text),['before-withdrawal']);const ledger=f.c.budget(f.d.id).snapshot();assert.equal(ledger.used.modelRequests,1);assert.equal(ledger.used.outputTokens,3);assert.equal(ledger.held.outputTokens,0);assert.equal(ledger.unknownCount,0);
 }finally{f.c.close();f.store.close();}
});
test('shortening the configured deadline notifies an already active silent request at the revised time',async()=>{
 const halted=[];const f=setup({halt:(_b,code)=>halted.push(code)});let entered,release;const started=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
 const pending=collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){entered();await barrier;yield{type:'finish',reason:{kind:'stop'}};})).catch(e=>e);
 try{await started;f.c.configureBudget(f.d.id,{revision:2,limits:{modelRequests:2,outputTokens:16,computeMilliseconds:0},expiresAt:new Date(Date.now()+40).toISOString()});await new Promise(r=>setTimeout(r,150));assert.ok(halted.includes('budget_expired'));assert.equal(f.c.snapshot(f.d.id).activeModelRequests,1); // Notification does not pretend the fixture has stopped.
 }finally{release();await pending;f.c.close();f.store.close();}
});
test('known overrun stops every already dispatched request sharing the same delegation budget',async()=>{
 const roles=[];const f=setup({halt:(b,code)=>roles.push([b.role,code])});let entered,release;const started=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
 const main=collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){entered();await barrier;yield{type:'finish',reason:{kind:'stop'}};})).catch(e=>e);
 try{await started;await assert.rejects(collect(f.c.stream({binding:{...f.binding,role:'worker',assignmentId:'worker'},sessionId:'worker-owned'},{...f.request,sessionId:'worker-owned'},async function*(){yield{type:'usage',usage:{inputTokens:1,outputTokens:9}};yield{type:'finish',reason:{kind:'stop'}};})),{code:'budget_exhausted'});assert.ok(roles.some(r=>r[0]==='main'&&r[1]==='budget_exhausted'));assert.ok(roles.some(r=>r[0]==='worker'&&r[1]==='budget_exhausted'));assert.equal(f.c.budget(f.d.id).snapshot().used.outputTokens,9);
 }finally{release();await main;f.c.close();f.store.close();}
});
test('official terminal failure chunks preserve safe retry codes while removing untrusted diagnostics',async()=>{
 const f=setup();try{const chunks=await collect(f.c.stream({binding:f.binding,sessionId:'owned'},f.request,async function*(){yield{type:'finish',reason:{kind:'error',failure:{code:'RATE_LIMIT',message:'ROOT_SYNTHETIC_PRIVATE_VALUE',status:429,providerRetryAfterMs:10,requestId:'ROOT_SYNTHETIC_PRIVATE_VALUE'}},replayState:{secret:'ROOT_SYNTHETIC_PRIVATE_VALUE'}};}));assert.equal(JSON.stringify(chunks).includes('ROOT_SYNTHETIC_PRIVATE_VALUE'),false);assert.equal(chunks[0].reason.failure.code,'RATE_LIMIT');assert.equal(chunks[0].reason.failure.status,429);assert.equal(chunks[0].reason.failure.providerRetryAfterMs,10);assert.equal(chunks[0].reason.failure.requestId,undefined);assert.equal(chunks[0].replayState,undefined);
 }finally{f.c.close();f.store.close();}
});
