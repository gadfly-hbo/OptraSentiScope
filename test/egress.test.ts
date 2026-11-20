import{test}from'node:test';
import assert from'node:assert/strict';
import{SentiStore}from'../src/store.ts';
import{HostEgress}from'../src/egress.ts';
import type{RunBinding}from'../runtime/index.ts';
test('missing egress authority never authorizes model, connector or export bytes',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'fixture',principalId:'operator'};
 const d=store.create(owner,{goal:'Engineering scope',idempotencyKey:'create'});
 const binding:RunBinding={owner,delegationId:d.id,goalRevision:1,role:'main',epoch:0,generation:1};
 const port=new HostEgress(store,{owner,isCurrent:()=>true});
 try {for(const channel of ['model','external-research','notification','export','telemetry','backup'])assert.throws(()=>port.authorize(binding,{channel,provider:'unapproved',model:'unapproved'}),{code:'egress_denied'});}finally{store.close();}
});
test('precise model route, owner and immutable authorization revision gate every request',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'fixture',principalId:'operator'};const d=store.create(owner,{goal:'Engineering scope',idempotencyKey:'create'});let current=true;
 const b:RunBinding={owner,delegationId:d.id,goalRevision:1,role:'main',epoch:0,generation:1};const port=new HostEgress(store,{owner,isCurrent:()=>current});
 try {const grant={revision:1,enabled:true,provider:'engineering-local',model:'fixture',maxTokens:64};port.configure(d.id,grant);grant.provider='mutated';
 const receipt=port.authorize(b,{channel:'model',provider:'engineering-local',model:'fixture',maxTokens:32});assert.equal(receipt.revision,1);
 for(const request of [{channel:'model',provider:'other',model:'fixture',maxTokens:32},{channel:'model',provider:'engineering-local',model:'fixture',maxTokens:65},{channel:'model',provider:'engineering-local',model:'fixture'},{channel:'export'}])assert.throws(()=>port.authorize(b,request),{code:'egress_denied'});
 assert.throws(()=>port.authorize({...b,owner:{...owner,principalId:'foreign'}},{channel:'model',provider:'engineering-local',model:'fixture',maxTokens:32}),{code:'stale_egress_binding'});
 assert.throws(()=>port.configure(d.id,{revision:1,enabled:false,provider:'engineering-local',model:'fixture',maxTokens:64}),{code:'stale_egress_grant'});
 port.configure(d.id,{revision:2,enabled:false,provider:'engineering-local',model:'fixture',maxTokens:64});assert.throws(()=>port.recheck(b,receipt),{code:'egress_denied'});
 current=false;assert.throws(()=>port.authorize(b,{channel:'model'}),{code:'stale_egress_binding'});
 }finally{store.close();}
});
