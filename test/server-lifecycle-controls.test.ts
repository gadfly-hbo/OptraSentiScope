import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {startLocalHost} from '../src/server.ts';

const owner={enterpriseId:'server-lifecycle-enterprise',principalId:'operator'};
test('research lifecycle and briefing preference commands reach the Host-bound research port',async()=>{
 const store=new SentiStore({filename:':memory:'}),delegation=store.create(owner,{goal:'Synthetic controls',idempotencyKey:'create'});
 const calls:unknown[]=[];
 const host=await startLocalHost({store,owner,port:0,researchPort:{
  status:{status:'unconfigured',message:'Synthetic runtime'},detail:()=>({researchStatus:{status:'unconfigured'}}),changed(){},
  pauseResearch(id,input){calls.push({id,kind:'pause',input});return{revision:1,researchPaused:true,collectionPaused:false,pausedScopes:[input.scope??''],updatedAt:new Date().toISOString()};},
  resumeResearch(id,input){calls.push({id,kind:'resume',input});return{revision:2,researchPaused:false,collectionPaused:false,pausedScopes:[],updatedAt:new Date().toISOString()};},
  async scheduleResume(id,input){calls.push({id,kind:'schedule_resume',input});return{kind:'resume'};},
  async scheduleEnd(id,input){calls.push({id,kind:'schedule_end',input});return{kind:'end'};},
  configureNotificationPreferences(id,input,expectedRevision){calls.push({id,kind:'preferences',input,expectedRevision});return{...input,revision:expectedRevision+1};}
 }});
 try{
  const request=async(path:string,body?:Record<string,unknown>)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value as Record<string,unknown>;};
  await request(`/api/delegations/${delegation.id}/commands`,{kind:'research_control',expectedVersion:0,action:'pause',mode:'direction',scope:'P1',reason:'Wait for operator',idempotencyKey:'pause'});
  await request(`/api/delegations/${delegation.id}/commands`,{kind:'research_control',expectedVersion:1,action:'resume',scope:'P1',reason:'Input arrived',idempotencyKey:'resume'});
  await request(`/api/delegations/${delegation.id}/commands`,{kind:'research_control',expectedVersion:2,action:'schedule_resume',at:new Date(Date.now()+60000).toISOString(),reason:'Promised time',idempotencyKey:'resume-plan'});
  await request(`/api/delegations/${delegation.id}/commands`,{kind:'research_control',expectedVersion:2,action:'schedule_end',at:new Date(Date.now()+120000).toISOString(),reason:'Validity',idempotencyKey:'end-plan'});
  await request(`/api/delegations/${delegation.id}/commands`,{kind:'notification_preferences',expectedRevision:1,timeZone:'UTC',time:'09:00:00',weekdays:[1,2,3,4,5],idempotencyKey:'preferences'});
  assert.equal(calls.length,5);
  assert.deepEqual(calls.map(call=>(call as {kind:string}).kind),['pause','resume','schedule_resume','schedule_end','preferences']);
 }finally{await host.close();store.close();}
});
