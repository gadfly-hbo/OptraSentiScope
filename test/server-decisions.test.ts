import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {startLocalHost} from '../src/server.ts';
import type {LocalHostOptions} from '../src/server.ts';

test('an exact operator response reaches the Host-owned decision seam after authorization, with no lifecycle or execution implication',async()=>{
 const store=new SentiStore({filename:':memory:'});const owner={enterpriseId:'decisions-http',principalId:'operator'};
 const d=store.create(owner,{goal:'Synthetic decision HTTP contract',idempotencyKey:'create'});
 const responses:unknown[]=[],changed:string[]=[];
 const port={status:{status:'synthetic',message:'No real model'},detail:()=>({decisions:[],decisionResponses:responses,operatorChoices:[]}),changed:(id:string)=>{changed.push(id);},
  async respondDecision(id:string,input:unknown){assert.equal(id,d.id);responses.push(input);return {id:'saved-human-response'};}};
 const host=await startLocalHost({store,owner,researchPort:port} as LocalHostOptions);
 const body={kind:'decision_response',id:'decision-exact',revision:1,artifact:{artifactId:'plan-exact',version:2},requestId:'reply-once',action:'acknowledge',text:'已知悉'};
 const post=(id:string,value:unknown)=>fetch(`${host.url}/api/delegations/${id}/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 try{
  const response=await post(d.id,body);assert.equal(response.status,200);
  assert.equal(responses.length,1);assert.deepEqual(responses[0],Object.fromEntries(Object.entries(body).filter(([key])=>key!=='kind')));
  assert.deepEqual(changed,[d.id]);const projection=await response.json() as {operatorChoices:unknown[];delegation:{lifecycle:string}};
  assert.deepEqual(projection.operatorChoices,[]);assert.equal(projection.delegation.lifecycle,'active');
  assert.equal((await post('another-delegation',body)).status,404);assert.equal(responses.length,1);
  assert.equal((await post(d.id,{...body,owner:{principalId:'forged'}})).status,400);assert.equal(responses.length,1);
 }finally{await host.close();store.close();}
});
