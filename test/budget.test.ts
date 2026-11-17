import {test} from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {BudgetStore} from '../src/budget.ts';
import type {RunBinding} from '../runtime/index.ts';
const owner={enterpriseId:'engineering-budget',principalId:'operator'};
function setup(t:TestContext) {
  const store=new SentiStore({filename:':memory:'});t.after(()=>store.close());
  const d=store.create(owner,{goal:'Synthetic engineering resource budget',idempotencyKey:'create'});
  const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:1,generation:1,role:'main'};
  const clock={at:'2026-11-17T00:00:00.000Z'};
  const budget=new BudgetStore(store,{owner,delegationId:d.id},{isCurrent:b=>b.epoch===1&&b.generation===1,now:()=>clock.at});
  return {store,d,binding,budget,clock};
}
test('an unconfigured delegation cannot reserve or dispatch model resources',(t)=>{
  const f=setup(t);
  assert.throws(()=>f.budget.reserve({id:'request-1',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding}),{code:'budget_unconfigured'});
});
test('main and worker reservations share one cumulative delegation limit',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:2,outputTokens:15,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  f.budget.reserve({id:'main-request',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});
  assert.throws(()=>f.budget.reserve({id:'worker-request',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:{...f.binding,role:'worker',assignmentId:'assignment-1'}}),{code:'budget_exhausted'});
});
test('reported usage settles only the actual output and returns the unused reservation',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:3,outputTokens:30,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  f.budget.reserve({id:'request',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});f.budget.dispatch('request');
  f.budget.settle('request',{receiptId:'native-attempt-1',actual:{modelRequests:1,outputTokens:4,computeMilliseconds:0},usage:{inputTokens:3,outputTokens:4,reasoningTokens:2,totalTokens:7}});
  assert.deepEqual(f.budget.snapshot().used,{modelRequests:1,outputTokens:4,computeMilliseconds:0});
  assert.deepEqual(f.budget.snapshot().held,{modelRequests:0,outputTokens:0,computeMilliseconds:0});
  assert.equal(f.budget.snapshot().remaining.outputTokens,26);
});
test('an uncertain finalizer cannot replace a receipt that already settled',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:2,outputTokens:20,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  f.budget.reserve({id:'request',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});f.budget.dispatch('request');
  f.budget.settle('request',{receiptId:'native-1',actual:{modelRequests:1,outputTokens:4,computeMilliseconds:0}});
  f.budget.markUnknown('request','late_cleanup_failed');assert.equal(f.budget.get('request')?.state,'settled');assert.equal(f.budget.snapshot().unknownCount,0);
});
test('only definitely undispatched resources can be released',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:2,outputTokens:20,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  f.budget.reserve({id:'request',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});f.budget.dispatch('request');
  assert.throws(()=>f.budget.releaseUndispatched('request'),{code:'budget_release_uncertain'});assert.equal(f.budget.snapshot().held.outputTokens,10);
});
test('request identities are immutable and duplicate reservations do not spend twice',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:2,outputTokens:20,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  const request={id:'same',kind:'model' as const,units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding};
  const first=f.budget.reserve(request);assert.deepEqual(f.budget.reserve(request),first);assert.equal(f.budget.snapshot().held.outputTokens,10);
  first.units.outputTokens=19;assert.equal(f.budget.get('same')?.units.outputTokens,10);
  assert.throws(()=>f.budget.reserve({...request,units:{...request.units,outputTokens:11}}),{code:'budget_request_conflict'});
  f.budget.dispatch('same');assert.throws(()=>f.budget.dispatch('same'),{code:'budget_dispatch_uncertain'});
});
test('pause and goal revision block new dispatch but late actual usage still charges the original delegation',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:2,outputTokens:20,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  f.budget.reserve({id:'in-flight',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});f.budget.dispatch('in-flight');
  const requested=f.store.requestLifecycle(owner,f.d.id,{expectedVersion:1,action:'pause',idempotencyKey:'pause'});const op=requested.pendingOperation!;
  f.store.completeLifecycle(owner,f.d.id,{operationId:op.id,expectedVersion:op.requestedVersion,outcome:'stopped',evidence:'No native handle in this budget contract fixture.'});
  const paused=f.store.get(owner,f.d.id);f.store.adjust(owner,f.d.id,{expectedVersion:paused.version,goal:'Synthetic revised goal',idempotencyKey:'adjust'});
  f.budget.settle('in-flight',{receiptId:'late-native-usage',actual:{modelRequests:1,outputTokens:5,computeMilliseconds:0}});
  assert.equal(f.budget.snapshot().used.outputTokens,5);assert.equal(f.store.get(owner,f.d.id).lifecycle,'paused');
  assert.throws(()=>f.budget.reserve({id:'stale',kind:'model',units:{modelRequests:1,outputTokens:5,computeMilliseconds:0},binding:f.binding}),{code:'budget_binding_stale'});
});
test('scope and current generation are checked before resource reservation',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:4,outputTokens:40,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  const request={id:'bound',kind:'model' as const,units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding};
  assert.throws(()=>f.budget.reserve({...request,binding:{...f.binding,epoch:2}}),{code:'budget_binding_stale'});
  assert.throws(()=>f.budget.reserve({...request,binding:{...f.binding,generation:2}}),{code:'budget_binding_stale'});
  assert.throws(()=>f.budget.reserve({...request,binding:{...f.binding,owner:{...owner,principalId:'other'}}}),{code:'budget_scope'});
  assert.deepEqual(f.budget.snapshot().held,{modelRequests:0,outputTokens:0,computeMilliseconds:0});
});
test('expiry rejects a reserved dispatch without refunding an uncertain request',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:2,outputTokens:20,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  f.budget.reserve({id:'pending',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});
  f.clock.at='2026-11-18T00:00:00.000Z';assert.throws(()=>f.budget.dispatch('pending'),{code:'budget_exhausted'});
  assert.equal(f.budget.snapshot().expired,true);f.budget.releaseUndispatched('pending');assert.equal(f.budget.snapshot().held.outputTokens,0);
  assert.equal(f.budget.releaseUndispatched('pending').state,'released');
});
test('an unknown usage receipt retains the full reservation until an actual receipt arrives',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:1,outputTokens:10,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  f.budget.reserve({id:'uncertain',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});f.budget.dispatch('uncertain');f.budget.unknown('uncertain','usage_missing');
  assert.equal(f.budget.snapshot().unknownCount,1);assert.equal(f.budget.snapshot().held.outputTokens,10);assert.equal(f.budget.snapshot().used.outputTokens,0);
  assert.throws(()=>f.budget.dispatch('uncertain'),{code:'budget_dispatch_uncertain'});assert.throws(()=>f.budget.releaseUndispatched('uncertain'),{code:'budget_release_uncertain'});
  f.budget.settle('uncertain',{receiptId:'reconciled-native-usage',actual:{modelRequests:1,outputTokens:3,computeMilliseconds:0}});
  assert.equal(f.budget.snapshot().unknownCount,0);assert.equal(f.budget.snapshot().used.outputTokens,3);assert.equal(f.budget.snapshot().held.outputTokens,0);
});
test('budget revisions preserve consumed and held resources and cannot be rewritten',(t)=>{
  const f=setup(t);const config={revision:1,limits:{modelRequests:2,outputTokens:20,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'};f.budget.configure(config);
  f.budget.reserve({id:'held',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});f.budget.dispatch('held');f.budget.unknown('held','process_interrupted');
  f.budget.configure({...config,revision:2,limits:{modelRequests:3,outputTokens:30,computeMilliseconds:0}});
  assert.equal(f.budget.snapshot().held.outputTokens,10);assert.equal(f.budget.snapshot().remaining.outputTokens,20);
  assert.throws(()=>f.budget.configure({...config,revision:2}),{code:'budget_revision_conflict'});assert.throws(()=>f.budget.configure(config),{code:'budget_revision_conflict'});
});
test('an overrun is recorded instead of discarded and closes later admission',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:5,outputTokens:50,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  f.budget.reserve({id:'oversized',kind:'model',units:{modelRequests:1,outputTokens:5,computeMilliseconds:0},binding:f.binding});f.budget.dispatch('oversized');
  const receipt=f.budget.settle('oversized',{receiptId:'actual-overrun',actual:{modelRequests:1,outputTokens:8,computeMilliseconds:0}});
  assert.equal(receipt.overrun,true);assert.equal(f.budget.snapshot().used.outputTokens,8);assert.equal(f.budget.snapshot().overrun,true);
  assert.throws(()=>f.budget.reserve({id:'later',kind:'model',units:{modelRequests:1,outputTokens:5,computeMilliseconds:0},binding:f.binding}),{code:'budget_exhausted'});
});
test('duplicate actual receipts are idempotent and conflicting receipts cannot overwrite them',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:3,outputTokens:30,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  for(const id of ['a','b']){f.budget.reserve({id,kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});f.budget.dispatch(id);}
  const receipt={receiptId:'native-receipt',actual:{modelRequests:1,outputTokens:4,computeMilliseconds:0}};f.budget.settle('a',receipt);f.budget.settle('a',receipt);
  assert.equal(f.budget.snapshot().used.outputTokens,4);
  assert.throws(()=>f.budget.settle('a',{...receipt,actual:{...receipt.actual,outputTokens:5}}),{code:'budget_receipt_conflict'});
  assert.throws(()=>f.budget.settle('b',receipt),{code:'budget_receipt_conflict'});assert.equal(f.budget.get('b')?.state,'dispatched');
});
test('compute resource accounting remains independent of model request capacity',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:0,outputTokens:0,computeMilliseconds:100},expiresAt:'2026-11-18T00:00:00.000Z'});
  assert.deepEqual(f.budget.snapshot().available,{model:false,compute:true});f.budget.reserve({id:'job',kind:'compute',units:{modelRequests:0,outputTokens:0,computeMilliseconds:100},binding:f.binding});f.budget.dispatch('job');
  f.budget.settle('job',{receiptId:'native-job-usage',actual:{modelRequests:0,outputTokens:0,computeMilliseconds:30}});assert.equal(f.budget.snapshot().remaining.computeMilliseconds,70);
});
test('invalid numeric limits and unmatched resource vectors fail before reserving',(t)=>{
  const f=setup(t);for(const invalid of [-1,0.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>f.budget.configure({revision:1,limits:{modelRequests:1,outputTokens:invalid,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'}),{code:'invalid_budget'});
  f.budget.configure({revision:1,limits:{modelRequests:1,outputTokens:10,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  assert.throws(()=>f.budget.reserve({id:'mixed',kind:'model',units:{modelRequests:1,outputTokens:1,computeMilliseconds:1},binding:f.binding}),{code:'invalid_budget'});
  assert.equal(f.budget.snapshot().held.outputTokens,0);
});
test('an outer transaction failure rolls back the reservation and its capacity claim',(t)=>{
  const f=setup(t);f.budget.configure({revision:1,limits:{modelRequests:1,outputTokens:10,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
  assert.throws(()=>f.store.withTransaction(()=>{f.budget.reserve({id:'rolled-back',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding:f.binding});throw Error('Synthetic transaction failure');}),/Synthetic transaction failure/);
  assert.equal(f.budget.get('rolled-back'),undefined);assert.equal(f.budget.snapshot().remaining.outputTokens,10);
});

test('unknown holds survive a real SQLite close and reopen without replay eligibility',()=>{
  const root=resolve('.local/tests');mkdirSync(root,{recursive:true});const directory=mkdtempSync(join(root,'budget-reopen-'));const filename=join(directory,'business.sqlite');
  let store=new SentiStore({filename});try{
    const d=store.create(owner,{goal:'Synthetic restart accounting',idempotencyKey:'create'});const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:1,generation:1,role:'main'};
    let budget=new BudgetStore(store,{owner,delegationId:d.id},{isCurrent:()=>true,now:()=>'2026-11-17T00:00:00.000Z'});
    budget.configure({revision:1,limits:{modelRequests:3,outputTokens:30,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
    budget.reserve({id:'interrupted',kind:'model',units:{modelRequests:1,outputTokens:10,computeMilliseconds:0},binding});budget.dispatch('interrupted');budget.markUnknown('interrupted','host_stopped');store.close();
    store=new SentiStore({filename});budget=new BudgetStore(store,{owner,delegationId:d.id},{isCurrent:()=>true,now:()=>'2026-11-17T00:00:00.000Z'});
    assert.equal(budget.get('interrupted')?.state,'unknown');assert.equal(budget.snapshot().held.outputTokens,10);assert.throws(()=>budget.dispatch('interrupted'),{code:'budget_dispatch_uncertain'});
    assert.throws(()=>budget.reserve({id:'cannot-ignore-hold',kind:'model',units:{modelRequests:1,outputTokens:25,computeMilliseconds:0},binding}),{code:'budget_exhausted'});
    budget.settle('interrupted',{receiptId:'late-durable-usage',actual:{modelRequests:1,outputTokens:7,computeMilliseconds:0}});assert.equal(budget.snapshot().remaining.outputTokens,23);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test('two independently opened budget ports cannot overbook the same SQLite delegation',()=>{
  const root=resolve('.local/tests');mkdirSync(root,{recursive:true});const directory=mkdtempSync(join(root,'budget-shared-'));const filename=join(directory,'business.sqlite');const a=new SentiStore({filename});let b:SentiStore|undefined;
  try{
    const d=a.create(owner,{goal:'Synthetic shared resource limits',idempotencyKey:'create'});b=new SentiStore({filename});const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,epoch:1,generation:1,role:'main'};
    const first=new BudgetStore(a,{owner,delegationId:d.id},{isCurrent:()=>true,now:()=>'2026-11-17T00:00:00.000Z'}),second=new BudgetStore(b,{owner,delegationId:d.id},{isCurrent:()=>true,now:()=>'2026-11-17T00:00:00.000Z'});
    first.configure({revision:1,limits:{modelRequests:2,outputTokens:20,computeMilliseconds:0},expiresAt:'2026-11-18T00:00:00.000Z'});
    first.reserve({id:'main',kind:'model',units:{modelRequests:1,outputTokens:12,computeMilliseconds:0},binding});assert.throws(()=>second.reserve({id:'worker',kind:'model',units:{modelRequests:1,outputTokens:12,computeMilliseconds:0},binding:{...binding,role:'worker',assignmentId:'worker-1'}}),{code:'budget_exhausted'});
    assert.equal(second.snapshot().held.outputTokens,12);assert.equal(first.snapshot().remaining.outputTokens,8);
  }finally{b?.close();a.close();rmSync(directory,{recursive:true,force:true});}
});
