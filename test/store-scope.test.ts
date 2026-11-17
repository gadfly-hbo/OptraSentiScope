import{test}from'node:test';
import assert from'node:assert/strict';
import{SentiStore}from'../src/store.ts';
test('resource qualification exposes only current scalar authority, preserves owner scope and follows lifecycle changes',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'scope-engineering',principalId:'operator'};
 try{const d=store.create(owner,{goal:'Private goal text stays outside a resource qualification view',idempotencyKey:'create'});assert.deepEqual(store.scope(owner,d.id),{id:d.id,version:1,goalRevision:1,lifecycle:'active'});assert.throws(()=>store.scope({...owner,principalId:'other'},d.id),{code:'not_found'});
 store.appendMessage(owner,d.id,{expectedVersion:1,text:'Historical context',idempotencyKey:'message'});store.adjust(owner,d.id,{expectedVersion:2,goal:'Current engineering goal',idempotencyKey:'adjust'});store.requestLifecycle(owner,d.id,{expectedVersion:3,action:'pause',idempotencyKey:'pause'});assert.deepEqual(store.scope(owner,d.id),{id:d.id,version:4,goalRevision:2,lifecycle:'pausing'});assert.equal(store.get(owner,d.id).messages.length,1);
 }finally{store.close();}
});
