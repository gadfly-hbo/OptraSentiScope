import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,renameSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';

const exec=promisify(execFile),project=resolve('.'),evidenceRoot=join(project,'.local/independent-delegation-ui-checks');
mkdirSync(evidenceRoot,{recursive:true});const output=mkdtempSync(join(evidenceRoot,'run-'));
const session=`sentiscope-independent-ui-${randomUUID()}`,operatorToken='independent-ui-operator-token',maintainerToken='independent-ui-maintainer-token';
const hash=value=>createHash('sha256').update(value).digest('hex');
const auth={operatorTokenHash:hash(operatorToken),maintainerTokenHash:hash(maintainerToken),sessionTtlSeconds:86400};
const owner={enterpriseId:'independent-ui-synthetic',principalId:'operator'};
const commands=[],services=new Set();let activeService;
async function browser(...args){const clean=args.map(value=>value===operatorToken||value===maintainerToken?'<redacted>':value);try{const result=await exec('agent-browser',['--session',session,...args],{timeout:120000,maxBuffer:4*1024*1024});commands.push({args:clean,exitCode:0,stdout:result.stdout});return result.stdout.trim();}catch(error){commands.push({args:clean,exitCode:error.code,stdout:error.stdout,stderr:error.stderr});throw error;}}
const screen=()=>browser('eval','document.querySelector("#screen").textContent');
async function waitScreen(text,timeout=90000){await browser('wait','--fn',`document.querySelector("#screen").textContent.includes(${JSON.stringify(text)})`,String(timeout));}
async function freePort(){const server=createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function startService(name,extra={},attempt=1){
 const root=join(output,name),port=extra.port??await freePort(),config=join(root,'host.json');mkdirSync(root,{recursive:true});
 writeFileSync(config,JSON.stringify({owner,port,dataDirectory:join(root,'data'),syntheticTrial:true,auth,intervalSeconds:60,...extra},null,2)+'\n',{mode:0o600});
 const stdout=openSync(join(root,`stdout-${attempt}.log`),'wx'),stderr=openSync(join(root,`stderr-${attempt}.log`),'wx');
 const child=spawn(process.execPath,[join(project,'scripts/runtime/start.mjs'),'--config',config,'--runtime-root',join(root,'runtime')],{cwd:project,stdio:['ignore',stdout,stderr]});closeSync(stdout);closeSync(stderr);
 const service={name,root,port,config,child,url:`http://127.0.0.1:${port}`,starts:attempt};services.add(service);activeService=service;
 const end=Date.now()+60000;while(Date.now()<end){if(child.exitCode!==null)throw new Error(`${name} exited before health: ${child.exitCode}`);try{const response=await fetch(`${service.url}/api/health`);if(response.ok)return service;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 throw new Error(`${name} health timeout`);
}
async function stopService(service){if(!service||!services.has(service))return;services.delete(service);if(activeService===service)activeService=undefined;const closed=new Promise(resolve=>service.child.once('close',resolve));service.child.kill('SIGTERM');const timeout=setTimeout(()=>service.child.kill('SIGKILL'),15000);await closed;clearTimeout(timeout);}
async function api(service,path,body){const login=await fetch(`${service.url}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:operatorToken})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];const response=await fetch(service.url+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;}
async function uiLogin(service){await browser('open',service.url);await browser('wait','--fn','!!document.querySelector("#login-form")');await browser('fill','#login-token',operatorToken);await browser('eval','document.querySelector("#login-form").requestSubmit()');await waitScreen('新建委托');}
async function uiCreate(goal,boundary='仅合成浏览器工程验证；不接真实模型、真实来源、经营动作或 Call。'){await browser('click','[data-action="create"]');await browser('wait','--fn','!!document.querySelector("#create-form")');await browser('fill','#goal-input',goal);await browser('fill','#boundary-input',boundary);await browser('eval','document.querySelector("#create-form").requestSubmit()');await waitScreen(goal.slice(0,20));}
async function pauseResume(service,id){let detail=await api(service,`/api/delegations/${id}`);if(detail.delegation.lifecycle==='active'){await browser('click','[data-action="pause"]');await waitScreen('委托已暂停');}await browser('click','[data-action="resume"]');const end=Date.now()+90000;while(Date.now()<end){detail=await api(service,`/api/delegations/${id}`);if(detail.delegation.lifecycle==='active'&&!detail.delegation.pendingOperation)return detail;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('resume timeout');}
let failure;
try{
 const source=mkdtempSync(join(tmpdir(),'sentiscope-independent-ui-source-')),fact=join(source,'fact.txt'),v1='合成来源版本一',v2='合成来源版本二',v3='合成来源版本三：失联恢复后补读';
 writeFileSync(fact,`${v1}：只含虚构工程事实。\n`);
 const main=await startService('main',{resourceDefaults:{sources:{goalIncludes:'独立委托浏览器',grants:[{sourceId:'trial-synthetic',directory:source,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true}]}}});
 const initialPid=main.child.pid,initialConfigHash=hash(readFileSync(main.config));
 await browser('set','viewport','1440','1000');await uiLogin(main);await browser('screenshot',join(output,'01-operator-overview.png'));
 const goal=`独立委托浏览器 ${randomUUID().slice(0,8)}：持续关注合成来源变化并说明依据。`;await uiCreate(goal);
 const createdList=await api(main,'/api/delegations'),created=createdList.delegations.find(item=>item.goal===goal);assert.ok(created);const id=created.id;
 await waitScreen(v1);assert.equal(main.child.pid,initialPid);assert.equal(main.starts,1);assert.equal(hash(readFileSync(main.config)),initialConfigHash);
 let detail=await api(main,`/api/delegations/${id}`);assert.equal(detail.sources.length,1);assert.equal(detail.sources[0].status,'ready');const report=detail.artifacts.find(item=>item.summary?.includes(v1));assert.ok(report);assert.equal(report.evidence.length,1);assert.ok(report.evidence[0].hash);
 await browser('click','[data-tab="sources"]');await waitScreen('fact.txt');await waitScreen(report.evidence[0].hash);await browser('screenshot',join(output,'02-source-v1-evidence.png'));
 await browser('click','[data-tab="progress"]');await browser('click','[data-action="pause"]');await waitScreen('委托已暂停');
 writeFileSync(fact,`${v2}：暂停期间产生的合成更新。\n`);await new Promise(resolve=>setTimeout(resolve,65000));assert.equal((await api(main,`/api/delegations/${id}`)).artifacts.some(item=>item.summary?.includes(v2)),false);await browser('screenshot',join(output,'03-paused-before-v2.png'));
 await browser('click','[data-action="resume"]');await waitScreen(v2);await browser('screenshot',join(output,'04-resumed-v2.png'));
 await browser('tab','new',`${main.url}#delegation/${id}/progress`);await waitScreen(v2);await browser('tab','t1');await browser('tab','close');await browser('screenshot',join(output,'05-workbench-reopen-v2.png'));
 await stopService(main);await startService('main',{port:main.port,resourceDefaults:{sources:{goalIncludes:'独立委托浏览器',grants:[{sourceId:'trial-synthetic',directory:source,grantRevision:1,enabled:true,cacheBody:true,allowHistorical:true}]}}},2);
 const restarted=activeService;assert.notEqual(restarted.child.pid,initialPid);assert.equal(hash(readFileSync(restarted.config)),initialConfigHash);
 await browser('open',`${restarted.url}#delegation/${id}/progress`);await waitScreen(v2);detail=await api(restarted,`/api/delegations/${id}`);assert.ok(detail.artifacts.some(item=>item.summary?.includes(v2)));await browser('screenshot',join(output,'06-service-restart-v2.png'));

 renameSync(source,`${source}-offline`);await pauseResume(restarted,id);detail=await api(restarted,`/api/delegations/${id}`);assert.equal(detail.sources[0].status,'unavailable');await browser('open',`${restarted.url}#delegation/${id}/sources`);await waitScreen('受阻');await browser('screenshot',join(output,'07-source-unavailable.png'));
 renameSync(`${source}-offline`,source);writeFileSync(fact,`${v3}\n`);await pauseResume(restarted,id);await browser('open',`${restarted.url}#delegation/${id}/progress`);await waitScreen(v3);detail=await api(restarted,`/api/delegations/${id}`);assert.equal(detail.sources[0].status,'ready');assert.ok(detail.sourceEvents.some(event=>event.kind==='restored'));await browser('screenshot',join(output,'08-source-restored-v3.png'));
 await stopService(restarted);

 const expired=await startService('expired',{resourceDefaults:{budget:{limits:{modelRequests:5,outputTokens:640,computeMilliseconds:0},durationMs:1500}}});await uiLogin(expired);const expiredGoal='自然到期浏览器演练：等待合成预算到期。';await uiCreate(expiredGoal);const expiredList=await api(expired,'/api/delegations'),expiredItem=expiredList.delegations.find(item=>item.goal===expiredGoal);assert.ok(expiredItem);
 const expiredEnd=Date.now()+10000;let expiredDetail;while(Date.now()<expiredEnd){expiredDetail=await api(expired,`/api/delegations/${expiredItem.id}`);if(expiredDetail.hostResources.budget.expired)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.equal(expiredDetail.researchStatus.reason,'budget_expired');assert.equal(expiredDetail.hostResources.budget.config.revision,1);await browser('open',`${expired.url}#delegation/${expiredItem.id}/progress`);await waitScreen('预算已到期');await browser('screenshot',join(output,'09-budget-expired.png'));await stopService(expired);

 const missing={provider:'sentiscope-missing-runtime-plugin',model:'synthetic',maxTokens:128};
 const unready=await startService('unready',{syntheticTrial:false,model:missing,resourceDefaults:{budget:{limits:{modelRequests:5,outputTokens:640,computeMilliseconds:0},durationMs:3600000},modelEgress:{enabled:true,...missing}}});
 const health=await (await fetch(`${unready.url}/api/health`)).json();assert.equal(health.runtime.status,'unavailable');await uiLogin(unready);const unreadyGoal='运行插件未就绪浏览器演练：保留委托但不派发。';await uiCreate(unreadyGoal);const unreadyList=await api(unready,'/api/delegations'),unreadyItem=unreadyList.delegations.find(item=>item.goal===unreadyGoal);assert.ok(unreadyItem);const unreadyDetail=await api(unready,`/api/delegations/${unreadyItem.id}`);assert.equal(unreadyDetail.researchStatus.reason,'runtime_plugin_unready');assert.equal(unreadyDetail.hostResources.modelDispatch,'waiting_resources');assert.equal(unreadyDetail.technical.some(item=>item.kind==='native_created'),false);await waitScreen('运行插件未就绪');await browser('screenshot',join(output,'10-runtime-plugin-unready.png'));await stopService(unready);
 await browser('set','viewport','390','844');assert.equal(await browser('eval','document.documentElement.scrollWidth<=innerWidth'),'true');assert.equal(await browser('errors'),'');
 writeFileSync(join(output,'result.json'),JSON.stringify({status:'PASS',delegationId:id,checks:['operator login and one-line create; source/report appears without Host edit, first restart or manual research trigger','basic judgment report links exact evidence and sources tab exposes fact.txt plus hash','pause blocks paused-period v2; resume automatically reconciles it','close/reopen and actual service restart preserve v2','source loss is visible; restore auto-reconciles v3 and records restored','passive budget expiry is visible without changing revision or renewing','missing runtime adapter is visible and creates no native dispatch','390px no horizontal overflow; no browser page errors'],commands},null,2)+'\n');
}catch(cause){failure={name:cause.name,message:cause.message,stack:cause.stack};writeFileSync(join(output,'result.json'),JSON.stringify({status:'FAIL',error:failure,commands},null,2)+'\n');}
finally{await browser('close').catch(()=>{});for(const service of [...services])await stopService(service).catch(()=>{});if(failure)console.error(failure.message);}
const result=JSON.parse(readFileSync(join(output,'result.json'),'utf8'));console.log(`${result.status}: ${output}`);if(result.status!=='PASS')process.exitCode=1;
