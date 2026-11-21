import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Engine} from '../runtime/node_modules/dsh-superagent/lib/index.js';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';
import {startLocalHost} from '../src/server.ts';

const exec=promisify(execFile),root=resolve('.local/revocation-ui-checks');mkdirSync(root,{recursive:true});const output=mkdtempSync(join(root,'run-')),session=`sentiscope-revocation-ui-${randomUUID()}`,marker='REVOKED_BODY_MUST_NOT_REPLAY_7f3e29',commands=[];
const directory=mkdtempSync(join(output,'fixture-')),sourceDirectory=join(directory,'source');mkdirSync(sourceDirectory);writeFileSync(join(sourceDirectory,'fact.txt'),marker);
const store=new SentiStore({filename:join(directory,'business.sqlite')}),owner={enterpriseId:'revocation-ui-fixture',principalId:'operator'},opened=[];
const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},interrupt(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${opened.length}-${Math.random()}`,...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic-review',model:'none'},intervalSeconds:60}),host=await startLocalHost({ allowUnauthenticated: true, store,owner,port:0,researchPort:coordinator,controlPort:coordinator.controlPort});
const invoke=(run,name,args)=>run.options.tools.find(tool=>tool.name===name).execute(args,{signal:new AbortController().signal}),main=()=>opened.filter(run=>run.binding.role==='main').at(-1);
async function browser(...args){try{const result=await exec('agent-browser',['--session',session,...args],{timeout:35000,maxBuffer:2*1024*1024});commands.push({args,stdout:result.stdout,stderr:result.stderr,exitCode:0});return result.stdout.trim();}catch(error){commands.push({args,stdout:error.stdout,stderr:error.stderr,exitCode:error.code,signal:error.signal});throw error;}}
let error;
try{
 const created=await fetch(`${host.url}/api/delegations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal:'Revocation browser review',boundary:'Synthetic only',idempotencyKey:'create'})});assert.equal(created.status,201);const id=(await created.json()).delegation.id;
 coordinator.configureSources(id,[{sourceId:'shared',directory:sourceDirectory,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true}]);await coordinator.sync(id);
 const context=await invoke(main(),'research_context',{}),candidate=context.candidates[0];await invoke(main(),'decide_event',{triggerId:candidate.triggers[0].id,evalId:candidate.evalId,kind:'accept',title:`Ticket ${marker}`,scope:'review',reason:'Review'});await coordinator.sync(id);
 const worker=opened.filter(run=>run.binding.role==='worker').at(-1),reference=context.references[0];await invoke(worker,'report_research',{state:'progress',summary:`Report body: ${marker}`,evidence:[{ref:reference.ref,hash:reference.hash}]});
 await invoke(main(),'publish_artifact',{expectedVersion:0,requestId:'source-plan',reason:'Review',content:{kind:'plan',title:`Plan ${marker}`,summary:`Plan body: ${marker}`,evidence:[{ref:reference.ref,hash:reference.hash}],assumptions:[],unknowns:[],applicability:'Synthetic only',invalidatedBy:[],recommendation:marker,alternatives:[{option:'Wait',costs:'None',risks:'Unknown'}],constraints:[],observation:{baseline:'Unknown',expectedChange:'Unknown',measure:'Synthetic',window:'Synthetic',source:'Synthetic',check:'Review'}}});
 await coordinator.sync(id);coordinator.configureSources(id,[]);await coordinator.sync(id);
 await browser('set','viewport','1440','1000');await browser('open',`${host.url}#delegation/${id}/progress`);await browser('wait','--fn','document.querySelector("#screen").textContent.includes("暂不回放")');assert.equal(await browser('eval',`document.body.textContent.includes('${marker}')`),'false');
 await browser('click','[data-tab="plan"]');await browser('wait','--fn','document.querySelector("#screen").textContent.includes("历史成果 · 正文待重核")');assert.equal(await browser('eval',`document.body.textContent.includes('${marker}')`),'false');
 await browser('click','[data-tab="sources"]');await browser('wait','--fn','document.querySelector("#screen").textContent.includes("已撤权")');assert.equal(await browser('eval',`document.body.textContent.includes('${marker}')`),'false');assert.equal(await browser('errors'),'');
 await browser('set','viewport','390','844');assert.equal(await browser('eval','document.documentElement.scrollWidth<=innerWidth'),'true');await browser('screenshot',join(output,'revoked-mobile.png'));writeFileSync(join(output,'result.json'),JSON.stringify({status:'PASS',delegationId:id,checks:['progress/plan/sources render safe metadata only','revoked marker absent in every browser tab','390px no horizontal overflow','no browser errors'],commands},null,2)+'\n');
}catch(cause){error={name:cause.name,message:cause.message,stack:cause.stack};writeFileSync(join(output,'result.json'),JSON.stringify({status:'FAIL',error,commands},null,2)+'\n');}
finally{await browser('close').catch(()=>{});await host.close();await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}
const result=JSON.parse(readFileSync(join(output,'result.json'),'utf8'));console.log(`${result.status}: ${output}`);if(result.status!=='PASS')process.exitCode=1;
