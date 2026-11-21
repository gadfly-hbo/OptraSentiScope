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
const operatorToken='synthetic-trial-operator-token',maintainerToken='synthetic-trial-maintainer-token';
const auth={operatorTokenHash:hash(operatorToken),maintainerTokenHash:hash(maintainerToken)};
async function login(host,token=operatorToken){const response=await fetch(`${host.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
async function request(host,path,{body,cookie,method}={}){const response=await fetch(host.url+path,{method:method??(body?'POST':'GET'),headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const value=await response.json();return {status:response.status,value};}
async function req(host,path,body,cookie){const response=await request(host,path,{body,cookie:cookie??await login(host)});assert.ok(response.status<300,JSON.stringify(response.value));return response.value;}
export async function apply(ctx,config){
 const result={status:'FAIL',scope:'Independent operator delegation + official Engine/Harness + fixed synthetic adapter + role/scope source defaults + lifecycle/restart + real resource/plugin states',checks:[]};let host,expiredHost,unreadyHost;
 try{
  const negOwner={enterpriseId:'synthetic-trial-negative',principalId:'operator'};
  await assert.rejects(startProductHost(ctx,{dataDirectory:resolve(config.root,'neg-model'),owner:negOwner,port:0,intervalSeconds:60,syntheticTrial:true,model:{provider:'openai',model:'gpt-4o'}}),/fixed local synthetic/);
  await assert.rejects(startProductHost(ctx,{dataDirectory:resolve(config.root,'neg-auth'),owner:negOwner,port:0,intervalSeconds:60,syntheticTrial:true,model:{provider:'sentiscope-synthetic-trial',model:'synthetic'}}),error=>error.code==='auth_configuration_required');
  result.checks.push('Permanent negatives: syntheticTrial rejects a non-fixed external model reference and refuses to start without local auth');

  const source=mkdtempSync(join(tmpdir(),'sentiscope-synthetic-trial-'));writeFileSync(resolve(source,'fact.txt'),'version one');
  const grant={sourceId:'trial',directory:source,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true};
  const settings={dataDirectory:resolve(config.root,'data'),owner:{enterpriseId:'synthetic-trial',principalId:'operator'},port:0,model:{provider:'sentiscope-synthetic-trial',model:'synthetic',maxTokens:128},intervalSeconds:60,syntheticTrial:true,auth,resourceDefaults:{sources:{goalIncludes:'synthetic trial',grants:[grant]}}};
  host=await startProductHost(ctx,settings);
  assert.equal((await request(host,'/api/delegations')).status,401);
  const cookie=await login(host),maintainerCookie=await login(host,maintainerToken);
  assert.equal((await request(host,'/api/delegations',{cookie:maintainerCookie})).status,403);
  assert.equal((await request(host,'/api/delegations',{cookie:maintainerCookie,body:{goal:'maintainer must not create',idempotencyKey:'maintainer-create'}})).status,403);
  result.checks.push('Local auth remains mandatory; maintainer cannot read or create operator delegations');

  const created=await req(host,'/api/delegations',{goal:'Track the synthetic trial source.',boundary:'Synthetic read only; no business action.',idempotencyKey:'trial-create'},cookie),id=created.delegation.id;
  const peer=await req(host,'/api/delegations',{goal:'Track a second synthetic trial source consumer.',boundary:'Synthetic read only.',idempotencyKey:'trial-peer'},cookie),peerId=peer.delegation.id;
  const mismatch=await req(host,'/api/delegations',{goal:'Track an unrelated private operations question.',boundary:'No source is preauthorized for this scope.',idempotencyKey:'trial-mismatch'},cookie),mismatchId=mismatch.delegation.id;
  assert.equal(created.sources.length,1);assert.equal(created.sources[0].sourceId,'trial');assert.equal(peer.sources.length,1);assert.equal(mismatch.sources.length,0);
  await wait(async()=>{const [a,b,n]=await Promise.all([id,peerId,mismatchId].map(value=>req(host,`/api/delegations/${value}`,undefined,cookie)));return a.intake.summary&&b.intake.summary&&a.artifacts.some(x=>x.summary?.includes('version one'))&&b.artifacts.some(x=>x.summary?.includes('version one'))&&!n.sources.length&&!n.sourceReferences.length;},'independent initial source-default research');
  result.checks.push('Two matching one-line operator delegations independently persist the same preauthorized source and automatically report version one; a mismatched delegation has no grant or source body');
  result.delegationIds=[id,peerId,mismatchId];

  host.coordinator.configureSources(peerId,[]);await host.coordinator.sync(peerId);
  writeFileSync(resolve(source,'fact.txt'),'version two');await host.coordinator.sync(id);
  await wait(async()=>{const d=await req(host,`/api/delegations/${id}`,undefined,cookie);return d.artifacts.some(x=>x.summary?.includes('version two'));},'remaining grant receives version two');
  const revoked=await req(host,`/api/delegations/${peerId}`,undefined,cookie);
  assert.equal(revoked.sources[0].status,'revoked');assert.equal(revoked.artifacts.some(x=>x.summary?.includes('version one')),false);assert.equal(revoked.artifacts.some(x=>x.summary?.includes('version two')),false);assert.equal(revoked.sourceReferences.length,0);
  result.checks.push('Single-sided revocation blocks subsequent body replay while the other independently authorized delegation continues');

  await host.close();host=undefined;host=await startProductHost(ctx,settings);
  const reopenedCookie=await login(host),reopened=await req(host,`/api/delegations/${id}`,undefined,reopenedCookie),reopenedPeer=await req(host,`/api/delegations/${peerId}`,undefined,reopenedCookie);
  assert.ok(reopened.artifacts.some(x=>x.summary?.includes('version two')));assert.equal(reopened.sources[0].status,'ready');assert.equal(reopenedPeer.sources[0].status,'revoked');
  result.checks.push('Host restart reads back persisted version-two research and default grants without reactivating the peer revocation');

  let detail=await req(host,`/api/delegations/${id}`,undefined,reopenedCookie);
  await req(host,`/api/delegations/${id}/commands`,{kind:'pause',expectedVersion:detail.delegation.version,idempotencyKey:'trial-pause'},reopenedCookie);
  await wait(async()=>{const d=await req(host,`/api/delegations/${id}`,undefined,reopenedCookie);return d.delegation.lifecycle==='paused'&&!d.delegation.pendingOperation;},'pause settles');
  const pausedCount=(await req(host,`/api/delegations/${id}`,undefined,reopenedCookie)).research.length;
  writeFileSync(resolve(source,'fact.txt'),'version three');await host.coordinator.sync(id);await new Promise(r=>setTimeout(r,2000));
  assert.equal((await req(host,`/api/delegations/${id}`,undefined,reopenedCookie)).research.length,pausedCount,'paused delegation must not start new research');
  detail=await req(host,`/api/delegations/${id}`,undefined,reopenedCookie);
  await req(host,`/api/delegations/${id}/commands`,{kind:'resume',expectedVersion:detail.delegation.version,idempotencyKey:'trial-resume'},reopenedCookie);
  await wait(async()=>{const d=await req(host,`/api/delegations/${id}`,undefined,reopenedCookie);return d.delegation.lifecycle==='active'&&d.artifacts.some(x=>x.summary?.includes('version three'));},'resume auto-reconciliation');
  result.checks.push('Pause blocks new research; resume automatically reconciles and reports the source update without an explicit sync');

  await host.close();host=undefined;
  expiredHost=await startProductHost(ctx,{dataDirectory:resolve(config.root,'expired-data'),owner:settings.owner,port:0,model:settings.model,intervalSeconds:60,syntheticTrial:true,auth,resourceDefaults:{budget:{limits:{modelRequests:5,outputTokens:640,computeMilliseconds:0},durationMs:1}}});
  const expiredCookie=await login(expiredHost),expiredCreated=await req(expiredHost,'/api/delegations',{goal:'Synthetic trial naturally expired budget',boundary:'No automatic renewal.',idempotencyKey:'expired-create'},expiredCookie),expiredId=expiredCreated.delegation.id;
  await wait(async()=>{const d=await req(expiredHost,`/api/delegations/${expiredId}`,undefined,expiredCookie);return d.hostResources.budget.expired;},'passive budget expiry',5000);
  const expired=await req(expiredHost,`/api/delegations/${expiredId}`,undefined,expiredCookie);
  assert.equal(expired.researchStatus.status,'waiting');assert.equal(expired.researchStatus.reason,'budget_expired');assert.equal(expired.hostResources.budget.config.revision,1);assert.equal(expired.hostResources.budget.used.modelRequests,0);assert.equal(expiredHost.store.connection.prepare('SELECT count(*) AS n FROM research_runs WHERE delegation_id=?').get(expiredId).n,0);
  result.checks.push('A naturally expired budget is shown as budget_expired with no active request, no native dispatch, no automatic renewal and unchanged limits');
  await expiredHost.close();expiredHost=undefined;

  unreadyHost=await startProductHost(ctx,{dataDirectory:resolve(config.root,'unready-data'),owner:{enterpriseId:'synthetic-unready',principalId:'operator'},port:0,model:{provider:'sentiscope-missing-plugin',model:'synthetic',maxTokens:128},intervalSeconds:60,auth,resourceDefaults:{budget:{limits:{modelRequests:5,outputTokens:640,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,provider:'sentiscope-missing-plugin',model:'synthetic',maxTokens:128}}},{localModelRoutes:[{provider:'sentiscope-missing-plugin',model:'synthetic'}]});
  const unreadyCookie=await login(unreadyHost),unreadyCreated=await req(unreadyHost,'/api/delegations',{goal:'Synthetic trial with a missing runtime adapter',boundary:'No dispatch while the plugin is unavailable.',idempotencyKey:'unready-create'},unreadyCookie),unreadyId=unreadyCreated.delegation.id;
  const health=await (await fetch(`${unreadyHost.url}/api/health`)).json(),unready=await req(unreadyHost,`/api/delegations/${unreadyId}`,undefined,unreadyCookie);
  assert.equal(health.runtime.status,'unavailable');assert.equal(unready.researchStatus.status,'unavailable');assert.equal(unready.researchStatus.reason,'runtime_plugin_unready');assert.equal(unready.hostResources.modelDispatch,'waiting_resources');assert.equal(unreadyHost.store.connection.prepare('SELECT count(*) AS n FROM research_runs WHERE delegation_id=?').get(unreadyId).n,0);
  result.checks.push('Host stays readable with a missing runtime adapter but reports runtime_plugin_unready and does not open native research or dispatch a model request');
  result.status='PASS';result.delegationId=id;
 }catch(error){result.error={name:error.name,message:error.message,stack:error.stack};}
 finally{for(const value of [host,expiredHost,unreadyHost])if(value)try{await value.close();}catch(error){result.status='FAIL';result.cleanupError=error.message;}writeFileSync(config.output,JSON.stringify(result,null,2)+'\n');}
}
