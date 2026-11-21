import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {startProductHost} from 'sentiscope-runtime/plugin';
export const name='sentiscope-synthetic-trial-check';
export const inject=['agents','agentLoop','sessions','sessionPersistence','schedule','llm','tools','credentials'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const wait=async(fn,label,timeout=80000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error(`Timed out: ${label}`);};
export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Product syntheticTrial flag + official Engine/Harness + fixed in-process synthetic adapter + local auth + source update/pause/resume',checks:[]};let host;
 const operatorToken='synthetic-trial-operator-token',maintainerToken='synthetic-trial-maintainer-token';
 try{
  const negOwner={enterpriseId:'synthetic-trial-negative',principalId:'operator'};
  await assert.rejects(startProductHost(ctx,{dataDirectory:resolve(config.root,'neg-model'),owner:negOwner,port:0,intervalSeconds:60,syntheticTrial:true,model:{provider:'openai',model:'gpt-4o'}}),/fixed local synthetic/);
  await assert.rejects(startProductHost(ctx,{dataDirectory:resolve(config.root,'neg-auth'),owner:negOwner,port:0,intervalSeconds:60,syntheticTrial:true,model:{provider:'sentiscope-synthetic-trial',model:'synthetic'}}),error=>error.code==='auth_configuration_required');
  result.checks.push('Permanent negatives: syntheticTrial rejects a non-fixed external model reference and refuses to start without local auth');
  const source=mkdtempSync(join(tmpdir(),'sentiscope-synthetic-trial-'));writeFileSync(resolve(source,'fact.txt'),'version one');
  host=await startProductHost(ctx,{dataDirectory:resolve(config.root,'data'),owner:{enterpriseId:'synthetic-trial',principalId:'operator'},port:0,model:{provider:'sentiscope-synthetic-trial',model:'synthetic',maxTokens:128},intervalSeconds:60,syntheticTrial:true,auth:{operatorTokenHash:hash(operatorToken),maintainerTokenHash:hash(maintainerToken)}});
  const unauthenticated=await fetch(`${host.url}/api/delegations`);assert.equal(unauthenticated.status,401);
  const login=await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:operatorToken})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const req=async(path,body)=>{const response=await fetch(host.url+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
  const maintainer=await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:maintainerToken})});assert.equal(maintainer.status,200);
  const maintainerCookie=maintainer.headers.get('set-cookie').split(';')[0];
  const forbidden=await fetch(`${host.url}/api/delegations`,{headers:{Cookie:maintainerCookie}});assert.equal(forbidden.status,403);
  result.checks.push('syntheticTrial requires local auth; operator login succeeds; maintainer cannot read operator business API');
  const created=await req('/api/delegations',{goal:'Track the synthetic trial source.',boundary:'Synthetic read only; no business action.',idempotencyKey:'trial-create'});const id=created.delegation.id;
  host.coordinator.configureSources(id,[{sourceId:'trial',directory:source,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true}]);await host.coordinator.sync(id);
  await wait(async()=>{const d=await req(`/api/delegations/${id}`);return d.intake.summary&&d.research.length>=1&&d.artifacts.some(x=>x.summary?.includes('version one'));},'initial synthetic research');
  result.checks.push('One-line delegation -> synthetic intake/ticket/worker -> exact version-one report through the fixed local adapter');
  writeFileSync(resolve(source,'fact.txt'),'version two');await host.coordinator.sync(id);
  await wait(async()=>{const d=await req(`/api/delegations/${id}`);return d.research.length>=2&&d.artifacts.some(x=>x.summary?.includes('version two'));},'synthetic source update');
  result.checks.push('Synthetic source update fans out to a durable receipt and supplements/independent research');
  let detail=await req(`/api/delegations/${id}`);
  await req(`/api/delegations/${id}/commands`,{kind:'pause',expectedVersion:detail.delegation.version,idempotencyKey:'trial-pause'});
  await wait(async()=>{const d=await req(`/api/delegations/${id}`);return d.delegation.lifecycle==='paused'&&!d.delegation.pendingOperation;},'pause settles');
  const pausedCount=(await req(`/api/delegations/${id}`)).research.length;
  writeFileSync(resolve(source,'fact.txt'),'version three');await host.coordinator.sync(id);await new Promise(r=>setTimeout(r,2000));
  assert.equal((await req(`/api/delegations/${id}`)).research.length,pausedCount,'paused delegation must not start new research');
  result.checks.push('Global pause settles durably and blocks new research while a source update arrives');
  detail=await req(`/api/delegations/${id}`);
  await req(`/api/delegations/${id}/commands`,{kind:'resume',expectedVersion:detail.delegation.version,idempotencyKey:'trial-resume'});
  await wait(async()=>{const d=await req(`/api/delegations/${id}`);return d.delegation.lifecycle==='active'&&!d.delegation.pendingOperation;},'resume settles');
  await wait(async()=>{const d=await req(`/api/delegations/${id}`);return d.artifacts.some(x=>x.summary?.includes('version three'));},'resume auto-reconciliation processes pending synthetic update');
  result.checks.push('Resume restores active lifecycle and auto-reconciliation processes the pending synthetic source update without an explicit sync');
  result.status='PASS';result.delegationId=id;
 }catch(error){result.error={name:error.name,message:error.message,stack:error.stack};}
 finally{if(host)await host.close();writeFileSync(config.output,JSON.stringify(result,null,2)+'\n');}
}