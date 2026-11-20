import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
test('without an authorized model native availability never invents running research',()=>{
 const store=new SentiStore({filename:':memory:'});const owner={enterpriseId:'engineering',principalId:'operator'};
 try { const d=store.create(owner,{goal:'Synthetic engineering goal',idempotencyKey:'create'});
 const native={async open(){throw new Error('MUST NOT OPEN');},async dispose(){}};
 const c=new ResearchCoordinator({store,owner,native,Engine:class{} as never});
 assert.equal((c.detail(d.id).researchStatus as {status:string}).status,'unconfigured');
 } finally {store.close();}
});
