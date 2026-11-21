import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
import {startLocalHost} from '../src/server.ts';

const marker='REVOKED_BODY_MUST_NOT_REPLAY_7f3e29';
test('revocation masks every source-derived body from the normal HTTP detail projection',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-revocation-projection-')),sourceDirectory=join(directory,'source');mkdirSync(sourceDirectory);const fact=join(sourceDirectory,'fact.txt');writeFileSync(fact,marker);
 const store=new SentiStore({filename:join(directory,'business.sqlite')}),owner={enterpriseId:'revocation-projection',principalId:'operator'},opened=[];
 const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},interrupt(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${opened.length}-${Math.random()}`,...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60}),host=await startLocalHost({ allowUnauthenticated: true, store,owner,port:0,researchPort:coordinator,controlPort:coordinator.controlPort});
 const invoke=(run,name,args)=>run.options.tools.find(tool=>tool.name===name).execute(args,{signal:new AbortController().signal}),main=()=>opened.filter(run=>run.binding.role==='main').at(-1);
 try{
  const created=await fetch(`${host.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'Revocation projection review',boundary:'Synthetic only',idempotencyKey:'create'})});assert.equal(created.status,201);const id=(await created.json()).delegation.id;
  coordinator.configureSources(id,[{sourceId:'shared',directory:sourceDirectory,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true}]);await coordinator.sync(id);
  const context=await invoke(main(),'research_context',{}),candidate=context.candidates[0];await invoke(main(),'decide_event',{triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:'accept',title:`Ticket ${marker}`,scope:'review',reason:'Review'});await coordinator.sync(id);
  const worker=opened.filter(run=>run.binding.role==='worker').at(-1),reference=context.references[0];
  await invoke(worker,'report_research',{state:'progress',summary:`Report body: ${marker}`,evidence:[{ref:reference.ref,hash:reference.hash}]});
  const artifact=await invoke(main(),'publish_artifact',{expectedVersion:0,requestId:'source-plan',reason:'Review',content:{kind:'plan',title:`Plan ${marker}`,summary:`Plan body: ${marker}`,evidence:[{ref:reference.ref,hash:reference.hash}],assumptions:[],unknowns:[],applicability:'Synthetic only',invalidatedBy:[],recommendation:marker,alternatives:[{option:'Wait',costs:'None',risks:'Unknown'}],constraints:[],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic',window:'Synthetic',source:'Synthetic',check:'Review'}}}),ref={artifactId:artifact.artifactId,version:artifact.version};
  await invoke(main(),'propose_decision',{expectedRevision:0,requestId:'source-decision',artifact:ref,title:`Decision ${marker}`,question:marker,options:[{id:'a',label:marker,scope:marker,costs:'None',risks:'Unknown'}],recommendation:{optionId:'a',reason:marker},unknowns:[marker],nondecisionImpact:marker,nextActions:[marker],window:{basis:marker,nextReviewAt:new Date(Date.now()+60000).toISOString()},reason:marker});
  await invoke(main(),'arrange_followup',{requestId:'source-followup',artifact:ref,reason:marker,dependencies:[marker],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}});
  await coordinator.sync(id);coordinator.configureSources(id,[]);await coordinator.sync(id);
  const response=await fetch(`${host.url}/api/delegations/${id}`);assert.equal(response.status,200);const detail=await response.json();
  let readRejection;try{await invoke(main(),'read_source',{ref:reference.ref,hash:reference.hash});}catch(error){readRejection=error.code;}
  assert.equal(readRejection,'source_revoked');assert.equal(detail.sourceReferences.length,0);const leaks=[];const walk=(value,path)=>{if(typeof value==='string'&&value.includes(marker))leaks.push(path);else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))walk(item,`${path}.${key}`);};walk(detail,'detail');assert.equal(JSON.stringify(detail).includes(marker),false,`normal detail must not return revoked source-derived body: ${leaks.join(', ')}`);
  assert.equal(detail.artifacts[0].summary,undefined);assert.equal(detail.artifactRevisions[0].content,undefined);assert.equal(detail.research[0].title,undefined);assert.equal(detail.decisions[0].title,undefined);assert.equal(detail.followups[0].reason,undefined);
 }finally{await host.close();await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}
});

test('zero-evidence derived bodies are masked fail-closed after source revocation',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-revocation-zero-')),sourceDirectory=join(directory,'source');mkdirSync(sourceDirectory);writeFileSync(join(sourceDirectory,'fact.txt'),marker);
 const store=new SentiStore({filename:join(directory,'business.sqlite')}),owner={enterpriseId:'revocation-zero',principalId:'operator'},opened=[];
 const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},interrupt(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${opened.length}-${Math.random()}`,...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60}),host=await startLocalHost({allowUnauthenticated:true,store,owner,port:0,researchPort:coordinator,controlPort:coordinator.controlPort});
 const invoke=(run,name,args)=>run.options.tools.find(tool=>tool.name===name).execute(args,{signal:new AbortController().signal}),main=()=>opened.filter(run=>run.binding.role==='main').at(-1);
 try{
  const created=await fetch(`${host.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'Zero evidence revocation review',boundary:'Synthetic only',idempotencyKey:'create'})});const id=(await created.json()).delegation.id;
  coordinator.configureSources(id,[{sourceId:'shared',directory:sourceDirectory,grantRevision:1,enabled:true}]);await coordinator.sync(id);
  const context=await invoke(main(),'research_context',{}),candidate=context.candidates[0];await invoke(main(),'decide_event',{triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:'accept',title:`Ticket ${marker}`,scope:'review',reason:'Review'});await coordinator.sync(id);
  const worker=opened.filter(run=>run.binding.role==='worker').at(-1);await invoke(worker,'report_research',{state:'progress',summary:`Report body: ${marker}`,evidence:[]});
  const artifact=await invoke(main(),'publish_artifact',{expectedVersion:0,requestId:'zero-plan',reason:'Review',content:{kind:'plan',title:`Plan ${marker}`,summary:`Plan body: ${marker}`,evidence:[],assumptions:[],unknowns:[],applicability:'Synthetic only',invalidatedBy:[],recommendation:marker,alternatives:[{option:'Wait',costs:'None',risks:'Unknown'}],constraints:[],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic',window:'Synthetic',source:'Synthetic',check:'Review'}}}),ref={artifactId:artifact.artifactId,version:artifact.version};
  await invoke(main(),'propose_decision',{expectedRevision:0,requestId:'zero-decision',artifact:ref,title:`Decision ${marker}`,question:marker,options:[{id:'a',label:marker,scope:marker,costs:'None',risks:'Unknown'}],recommendation:{optionId:'a',reason:marker},unknowns:[],nondecisionImpact:'wait',nextActions:[],window:{basis:'Synthetic',nextReviewAt:new Date(Date.now()+60000).toISOString()},reason:'Review'});
  await invoke(main(),'arrange_followup',{requestId:'zero-followup',artifact:ref,reason:`Followup ${marker}`,dependencies:[],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}});
  await coordinator.sync(id);coordinator.configureSources(id,[]);await coordinator.sync(id);
  const detail=await (await fetch(`${host.url}/api/delegations/${id}`)).json();assert.equal(JSON.stringify(detail).includes(marker),false,'zero-evidence historical derived bodies must not replay after revocation');
 }finally{await host.close();await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}
});
