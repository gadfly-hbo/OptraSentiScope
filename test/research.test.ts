import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
import {HostControls} from '../runtime/controls.ts';
import {startLocalHost} from '../src/server.ts';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('without an authorized model native availability never invents running research',()=>{
 const store=new SentiStore({filename:':memory:'});const owner={enterpriseId:'engineering',principalId:'operator'};
 try { const d=store.create(owner,{goal:'Synthetic engineering goal',idempotencyKey:'create'});
 const native={async open(){throw new Error('MUST NOT OPEN');},async dispose(){}};
 const c=new ResearchCoordinator({store,owner,native,Engine:class{} as never});
 assert.equal((c.detail(d.id).researchStatus as {status:string}).status,'unconfigured');
 } finally {store.close();}
});

test('passive budget expiry is the visible research reason without an in-flight block',()=>{
 const store=new SentiStore({filename:':memory:'});const owner={enterpriseId:'engineering',principalId:'operator'};
 const d=store.create(owner,{goal:'Synthetic expiring budget',idempotencyKey:'create'});
 const controls=new HostControls({store,owner,isCurrent:()=>true,verifyInput:async()=>{},halt:()=>{},credentialRecords:{async readRecord(){return undefined;},async modifyRecord(){return undefined;}},modelSelection:{provider:'engineering-local',model:'fixture',maxTokens:8},localModelRoutes:[{provider:'engineering-local',model:'fixture'}]});
 try{
  controls.configureModelEgress(d.id,{revision:1,enabled:true,provider:'engineering-local',model:'fixture',maxTokens:8});
  controls.configureBudget(d.id,{revision:1,limits:{modelRequests:2,outputTokens:16,computeMilliseconds:0},expiresAt:new Date(Date.now()-1000).toISOString()});
  const native={async open(){throw new Error('MUST NOT OPEN');},async dispose(){}};
  const c=new ResearchCoordinator({store,owner,native,Engine:class{} as never,controls,model:{provider:'engineering-local',model:'fixture',maxTokens:8}});
  const detail=c.detail(d.id) as {researchStatus:{status:string;reason:string};hostResources:{budget:{expired:boolean};block:string|null}};
  assert.equal(detail.hostResources.budget.expired,true);assert.equal(detail.hostResources.block,null);
  assert.equal(detail.researchStatus.status,'waiting');assert.equal(detail.researchStatus.reason,'budget_expired');
 }finally{controls.close();store.close();}
});

test('a missing runtime adapter is unavailable rather than configured',()=>{
 const store=new SentiStore({filename:':memory:'});const owner={enterpriseId:'engineering',principalId:'operator'};
 try{const d=store.create(owner,{goal:'Synthetic missing runtime plugin',idempotencyKey:'create'});
 const native={async open(){throw new Error('MUST NOT OPEN');},async dispose(){}};
 const options={store,owner,native,Engine:class{} as never,model:{provider:'missing-plugin',model:'synthetic',maxTokens:128},runtimeReady:()=>false};
 const c=new ResearchCoordinator(options);
 assert.equal(c.status.status,'unavailable');
 const status=c.detail(d.id).researchStatus as {status:string;reason:string};
 assert.equal(status.status,'unavailable');assert.equal(status.reason,'runtime_plugin_unready');
 }finally{store.close();}
});

class ReconciliationEngine {receive(){} evaluateDue(){} policyChanged(){}}
const inertNative={async open(){throw new Error('MUST NOT OPEN');},async dispose(){}};
const sourceDetail=(coordinator:ResearchCoordinator,id:string)=>coordinator.detail(id) as {sources:{sourceId:string;status:string;grantRevision:number}[];sourceReferences:unknown[]};

test('default grants are revoked when the current policy or delegation scope no longer matches and are never silently restored',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sentiscope-default-scope-')),filename=join(root,'business.sqlite'),directory=join(root,'source');mkdirSync(directory);writeFileSync(join(directory,'fact.txt'),'synthetic scoped fact');
 const owner={enterpriseId:'engineering-default-scope',principalId:'operator'},grant={sourceId:'trial',directory,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true};
 const coordinator=(store:SentiStore,goalIncludes:string)=>new ResearchCoordinator({store,owner,native:inertNative,Engine:ReconciliationEngine as never,sourceDefaults:{goalIncludes,grants:[grant]}});
 let store=new SentiStore({filename}),c=coordinator(store,'alpha'),id:string;
 try{const d=store.create(owner,{goal:'approved scope alpha',idempotencyKey:'create'});id=d.id;c.applySourceDefaults(id,'operator',true);await c.sync(id);assert.equal(sourceDetail(c,id).sourceReferences.length,1);await c.close();store.close();
  store=new SentiStore({filename});c=coordinator(store,'narrower-beta');await c.sync(id);let detail=sourceDetail(c,id);assert.equal(detail.sources[0].status,'revoked');assert.equal(detail.sourceReferences.length,0);await c.close();store.close();
  store=new SentiStore({filename});c=coordinator(store,'alpha');await c.sync(id);detail=sourceDetail(c,id);assert.equal(detail.sources[0].status,'revoked');assert.equal(detail.sources[0].grantRevision,2);assert.equal(detail.sourceReferences.length,0);
 }finally{await c.close().catch(()=>{});store.close();rmSync(root,{recursive:true,force:true});}
});

test('goal adjustments and create idempotency replay never add default grants, while narrowing revokes an existing default',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sentiscope-default-replay-')),directory=join(root,'source');mkdirSync(directory);writeFileSync(join(directory,'fact.txt'),'synthetic scoped fact');
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'engineering-default-replay',principalId:'operator'},grant={sourceId:'trial',directory,grantRevision:1,enabled:true};
 const c=new ResearchCoordinator({store,owner,native:inertNative,Engine:ReconciliationEngine as never,sourceDefaults:{goalIncludes:'approved',grants:[grant]}});
 try{const first=store.create(owner,{goal:'other initial goal',idempotencyKey:'create-first'});c.applySourceDefaults(first.id,'operator',true);assert.equal(sourceDetail(c,first.id).sources.length,0);
  const adjusted=store.adjust(owner,first.id,{expectedVersion:first.version,goal:'approved only after adjustment',idempotencyKey:'adjust-first'});store.create(owner,{goal:'other initial goal',idempotencyKey:'create-first'});c.applySourceDefaults(adjusted.id,'operator',false);await c.sync(adjusted.id);assert.equal(sourceDetail(c,adjusted.id).sources.length,0);
  const second=store.create(owner,{goal:'approved at creation',idempotencyKey:'create-second'});c.applySourceDefaults(second.id,'operator',true);assert.equal(sourceDetail(c,second.id).sources.length,1);
  const narrowed=store.adjust(owner,second.id,{expectedVersion:second.version,goal:'other narrowed scope',idempotencyKey:'adjust-second'});await c.sync(narrowed.id);assert.equal(sourceDetail(c,narrowed.id).sources[0].status,'revoked');
  store.create(owner,{goal:'approved at creation',idempotencyKey:'create-second'});c.applySourceDefaults(narrowed.id,'operator',false);await c.sync(narrowed.id);assert.equal(sourceDetail(c,narrowed.id).sources[0].status,'revoked');assert.equal(sourceDetail(c,narrowed.id).sources[0].grantRevision,2);
 }finally{await c.close();store.close();rmSync(root,{recursive:true,force:true});}
});

test('partial default revocation does not protect remaining defaults from scope narrowing or restart',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sentiscope-partial-default-')),filename=join(root,'business.sqlite'),a=join(root,'a'),b=join(root,'b');mkdirSync(a);mkdirSync(b);writeFileSync(join(a,'fact.txt'),'A');writeFileSync(join(b,'fact.txt'),'B');
 const owner={enterpriseId:'engineering-partial-default',principalId:'operator'},grantA={sourceId:'a',directory:a,grantRevision:1,enabled:true,cacheBody:true},grantB={sourceId:'b',directory:b,grantRevision:1,enabled:true,cacheBody:true};
 const coordinator=(store:SentiStore)=>new ResearchCoordinator({store,owner,native:inertNative,Engine:ReconciliationEngine as never,sourceDefaults:{goalIncludes:'approved',grants:[grantA,grantB]}});
 let store=new SentiStore({filename}),c=coordinator(store),id:string;
 try{const created=store.create(owner,{goal:'approved at creation',idempotencyKey:'create'});id=created.id;c.applySourceDefaults(id,'operator',true);await c.sync(id);assert.equal(sourceDetail(c,id).sourceReferences.length,2);
  c.configureSources(id,[grantB]);await c.sync(id);let detail=sourceDetail(c,id);assert.equal(detail.sources.find(x=>x.sourceId==='a')?.status,'revoked');assert.equal(detail.sources.find(x=>x.sourceId==='b')?.status,'ready');
  const adjusted=store.adjust(owner,id,{expectedVersion:created.version,goal:'other narrowed scope',idempotencyKey:'adjust'});await c.sync(adjusted.id);detail=sourceDetail(c,id);assert.equal(detail.sources.find(x=>x.sourceId==='a')?.status,'revoked');assert.equal(detail.sources.find(x=>x.sourceId==='b')?.status,'revoked');assert.equal(detail.sourceReferences.length,0);await c.close();store.close();
  store=new SentiStore({filename});c=coordinator(store);await c.sync(id);detail=sourceDetail(c,id);assert.equal(detail.sources.find(x=>x.sourceId==='b')?.status,'revoked');assert.equal(detail.sourceReferences.length,0);
 }finally{await c.close().catch(()=>{});store.close();rmSync(root,{recursive:true,force:true});}
});

test('manual grants survive default policy removal while remaining defaults are revoked',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sentiscope-policy-removal-')),filename=join(root,'business.sqlite'),a=join(root,'a'),b=join(root,'b');mkdirSync(a);mkdirSync(b);writeFileSync(join(a,'fact.txt'),'A');writeFileSync(join(b,'fact.txt'),'B');
 const owner={enterpriseId:'engineering-policy-removal',principalId:'operator'},grantA={sourceId:'a',directory:a,grantRevision:1,enabled:true,cacheBody:true},grantB={sourceId:'b',directory:b,grantRevision:1,enabled:true,cacheBody:true};
 const coordinator=(store:SentiStore,withDefaults:boolean)=>new ResearchCoordinator({store,owner,native:inertNative,Engine:ReconciliationEngine as never,...(withDefaults?{sourceDefaults:{goalIncludes:'approved',grants:[grantA,grantB]}}:{})});
 let store=new SentiStore({filename}),c=coordinator(store,true),id:string;
 try{const created=store.create(owner,{goal:'approved at creation',idempotencyKey:'create'});id=created.id;c.applySourceDefaults(id,'operator',true);await c.sync(id);
  const manualA={...grantA,grantRevision:2,cacheBody:false};c.configureSources(id,[manualA,grantB]);await c.sync(id);await c.close();store.close();
  store=new SentiStore({filename});c=coordinator(store,false);await c.sync(id);let detail=sourceDetail(c,id);assert.equal(detail.sources.find(x=>x.sourceId==='a')?.status,'ready');assert.equal(detail.sources.find(x=>x.sourceId==='a')?.grantRevision,2);assert.equal(detail.sources.find(x=>x.sourceId==='b')?.status,'revoked');assert.equal(detail.sourceReferences.length,1);
  c.configureSources(id,[manualA,{...grantB,grantRevision:3,cacheBody:false}]);await c.sync(id);await c.close();store.close();
  store=new SentiStore({filename});c=coordinator(store,false);await c.sync(id);detail=sourceDetail(c,id);assert.equal(detail.sources.find(x=>x.sourceId==='a')?.status,'ready');assert.equal(detail.sources.find(x=>x.sourceId==='b')?.status,'ready');assert.equal(detail.sourceReferences.length,2);
 }finally{await c.close().catch(()=>{});store.close();rmSync(root,{recursive:true,force:true});}
});

test('revision-one create replay after a policy-changing restart remains a replay and adds no grant',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sentiscope-create-replay-restart-')),filename=join(root,'business.sqlite'),directory=join(root,'source');mkdirSync(directory);writeFileSync(join(directory,'fact.txt'),'synthetic fact');
 const owner={enterpriseId:'engineering-create-replay-restart',principalId:'operator'},grant={sourceId:'trial',directory,grantRevision:1,enabled:true};
 let store:SentiStore|undefined,coordinator:ResearchCoordinator|undefined,host:Awaited<ReturnType<typeof startLocalHost>>|undefined;
 const boot=async(goalIncludes:string)=>{store=new SentiStore({filename});coordinator=new ResearchCoordinator({store,owner,native:inertNative,Engine:ReconciliationEngine as never,sourceDefaults:{goalIncludes,grants:[grant]}});host=await startLocalHost({store,owner,port:0,allowUnauthenticated:true,researchPort:coordinator});};
 const close=async()=>{if(host)await host.close();if(coordinator)await coordinator.close();if(store)store.close();host=undefined;coordinator=undefined;store=undefined;};
 const create=async()=>{const response=await fetch(`${host!.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'other initial goal',idempotencyKey:'create-replay'})});assert.equal(response.status,201);return await response.json() as {delegation:{id:string;goalRevision:number};sources:unknown[]};};
 try{await boot('alpha');const first=await create();assert.equal(first.delegation.goalRevision,1);assert.equal(first.sources.length,0);await close();await boot('other');const replay=await create();assert.equal(replay.delegation.id,first.delegation.id);assert.equal(replay.delegation.goalRevision,1);assert.equal(replay.sources.length,0);}finally{await close();rmSync(root,{recursive:true,force:true});}
});

test('persisted host resource UNKNOWN takes precedence over a missing runtime adapter',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'engineering-unknown-plugin',principalId:'operator'},d=store.create(owner,{goal:'Synthetic unknown and missing plugin',idempotencyKey:'create'});
 const controls=new HostControls({store,owner,isCurrent:()=>true,verifyInput:async()=>{},halt:()=>{},credentialRecords:{async readRecord(){return undefined;},async modifyRecord(){return undefined;}},modelSelection:{provider:'missing-plugin',model:'synthetic',maxTokens:128},localModelRoutes:[{provider:'missing-plugin',model:'synthetic'}]});
 try{store.connection.prepare('INSERT INTO host_resource_blocks VALUES (?,?,?,?,?)').run(owner.enterpriseId,owner.principalId,d.id,'host_resource_unconfirmed',new Date().toISOString());
  const c=new ResearchCoordinator({store,owner,native:inertNative,Engine:ReconciliationEngine as never,controls,model:{provider:'missing-plugin',model:'synthetic',maxTokens:128},runtimeReady:()=>false});
  const detail=c.detail(d.id) as {researchStatus:{status:string;reason:string};hostResources:{block:string}};
  assert.equal(detail.hostResources.block,'host_resource_unconfirmed');assert.equal(detail.researchStatus.status,'unknown');assert.equal(detail.researchStatus.reason,'host_resource_unconfirmed');
 }finally{controls.close();store.close();}
});
