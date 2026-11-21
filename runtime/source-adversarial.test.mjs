import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {SentiStore} from '../src/store.ts';
import {SourceStore} from '../src/sources.ts';

const owner={enterpriseId:'source-adversarial',principalId:'reviewer'},sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(){const directory=mkdtempSync(join(tmpdir(),'sentiscope-source-adversarial-')),store=new SentiStore({filename:join(directory,'business.sqlite')});return{directory,store,close(){store.close();rmSync(directory,{recursive:true,force:true});}};}

test('an older asynchronous snapshot cannot roll back a newer cursor or repeat business effects',async()=>{
 const f=fixture(),sourceDirectory=join(f.directory,'authorized');mkdirSync(sourceDirectory);
 try{
  const item=f.store.create(owner,{goal:'Concurrent source ordering',idempotencyKey:'create'}),sources=new SourceStore(f.store,{owner,delegationId:item.id}),fact=join(sourceDirectory,'fact.txt');writeFileSync(fact,'version one');sources.configureGrants([{sourceId:'shared',directory:sourceDirectory,grantRevision:1,enabled:true}]);await sources.scan(()=>{});
  const base=SourceStore.createCollectionCycle();let markCaptured,release;const captured=new Promise(resolve=>{markCaptured=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const delayed={id:base.id,get acquisitions(){return base.acquisitions;},async snapshot(source,grant){const snapshot=await base.snapshot(source,grant);markCaptured();await gate;return snapshot;}};
  const older=sources.scan(()=>{},delayed);await captured;writeFileSync(fact,'version two');const newer=await sources.scan(()=>{});assert.equal(newer.find(event=>event.kind==='updated')?.record.hash,sha('version two'));release();
  assert.deepEqual(await older,[],'a superseded snapshot is a no-op rather than a late successful write');
  assert.equal(sources.listReferences()[0].hash,sha('version two'));
  assert.deepEqual(await sources.scan(()=>{}),[],'the newer version is not emitted a second time after the stale scan finishes');
 }finally{f.close();}
});

test('canonical path aliases share one immutable acquisition and never mix bodies under one collection ID',async()=>{
 const f=fixture(),actual=join(f.directory,'actual'),alias=join(f.directory,'alias');mkdirSync(actual);symlinkSync(actual,alias,'dir');
 try{
  const a=f.store.create(owner,{goal:'Canonical A',idempotencyKey:'a'}),b=f.store.create(owner,{goal:'Canonical B',idempotencyKey:'b'}),sourcesA=new SourceStore(f.store,{owner,delegationId:a.id}),sourcesB=new SourceStore(f.store,{owner,delegationId:b.id}),fact=join(actual,'fact.txt');writeFileSync(fact,'version one');
  sourcesA.configureGrants([{sourceId:'shared',directory:actual,grantRevision:1,enabled:true}]);sourcesB.configureGrants([{sourceId:'shared',directory:alias,grantRevision:1,enabled:true}]);
  const cycle=SourceStore.createCollectionCycle(),eventsA=await sourcesA.scan(()=>{},cycle);writeFileSync(fact,'version two');const eventsB=await sourcesB.scan(()=>{},cycle),createdA=eventsA.find(event=>event.kind==='created'),createdB=eventsB.find(event=>event.kind==='created');
  assert.equal(cycle.acquisitions,1);assert.equal(createdA.collectionId,createdB.collectionId);assert.equal(createdA.record.hash,createdB.record.hash);assert.equal(createdB.record.hash,sha('version one'));
 }finally{f.close();}
});
