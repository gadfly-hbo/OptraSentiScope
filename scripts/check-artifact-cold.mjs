import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,copyFileSync,symlinkSync,openSync,closeSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length>2)throw Error('This isolated engineering check takes no external configuration or credentials');
process.umask(0o077);
const root=resolve(project,'.local/artifact-cold-checks',`run-${Date.now()}-${randomUUID()}`),home=resolve(root,'home'),consumer=resolve(root,'consumer'),source=resolve(project,'.local/official-sdk/superagent'),runtime=resolve(project,'runtime'),sdk=resolve(project,'.local/official-sdk/harness');
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sources=directory=>readdirSync(resolve(project,directory),{withFileTypes:true}).flatMap(entry=>entry.name==='node_modules'||entry.name==='locks'?[]:entry.isDirectory()?sources(`${directory}/${entry.name}`):entry.isFile()&&/\.(ts|mjs|js|json|html|css|svg)$/.test(entry.name)?[`${directory}/${entry.name}`]:[]);
const files=[...sources('src'),...sources('runtime'),...sources('test'),...sources('scripts'),'package.json','package-lock.json','tsconfig.json','runtime/locks/identity.json','runtime/locks/harness/package.json','runtime/locks/harness/package-lock.json','runtime/locks/toolchain/package.json','runtime/locks/toolchain/package-lock.json','scripts/sdk/README.md','.github/workflows/check.yml'].sort();
const identity=()=>({at:new Date().toISOString(),node:process.version,files:files.map(path=>({path,sha256:digest(resolve(project,path))})),sdk:{harness:JSON.parse(readFileSync(resolve(sdk,'node_modules/@deepseek-ai/dsh/package.json'))).version,schedule:JSON.parse(readFileSync(resolve(sdk,'node_modules/@deepseek-ai/dsh-schedule/package.json'))).version,scheduleRootSha256:digest(resolve(sdk,'node_modules/@deepseek-ai/dsh-schedule/lib/index.js')),superagentRootSha256:digest(resolve(source,'lib/index.js')),superagentManifestSha256:digest(resolve(source,'package.json')),superagentLockSha256:digest(resolve(source,'pnpm-lock.yaml'))}});
mkdirSync(resolve(consumer,'node_modules'),{recursive:true,mode:0o700});const before=identity();save(resolve(root,'identity-before.json'),before);
copyFileSync(resolve(project,'scripts/runtime/artifact-cold-probe.mjs'),resolve(consumer,'index.mjs'));
for(const[name,target]of[['dsh-superagent',source],['sentiscope-runtime',runtime]])symlinkSync(target,resolve(consumer,'node_modules',name));
save(resolve(consumer,'package.json'),{name:'sentiscope-artifact-cold-check',private:true,type:'module',main:'index.mjs',peerDependencies:{'@deepseek-ai/dsh-llm':'0.2.2-rc.3','@deepseek-ai/dsh-session':'0.2.2-rc.3','@deepseek-ai/dsh-schedule':'0.2.2-rc.3'},dependencies:{'dsh-superagent':`link:${source}`,'sentiscope-runtime':`link:${runtime}`}});
const vault=resolve(root,'private/credentials.yaml');mkdirSync(dirname(vault),{recursive:true,mode:0o700});
const services=[['credentials','dsh-credentials-local',{path:vault,watch:false}],['llm','dsh-llm'],['session','dsh-session'],['projection','dsh-session-projection'],['prompt','dsh-system-prompt'],['tools','dsh-tools'],['executor','dsh-tool-executor-native'],['agent','dsh-agent'],['loop','dsh-agent-loop'],['persistence','dsh-session-persistence-jsonl',{root:resolve(root,'native/sessions'),compression:'none'}],['storage','dsh-storage'],['json','dsh-storage-json',{root:resolve(root,'native/storage')}],['domain','dsh-storage-domain',{backend:'json'}],['schedule','dsh-schedule']].map(([id,name,config])=>({id,name:`@deepseek-ai/${name}`,...(config?{config}:{})}));
for(const phase of ['first','cold']){
 const profile=resolve(home,'profiles',phase);mkdirSync(resolve(profile,'node_modules'),{recursive:true,mode:0o700});
 for(const[name,target]of[['dsh-superagent',source],['sentiscope-runtime',runtime],['sentiscope-artifact-cold-check',consumer]])symlinkSync(target,resolve(profile,'node_modules',name));
 save(resolve(profile,'package.json'),{name:`sentiscope-artifact-cold-${phase}`,private:true,type:'module',dependencies:{'dsh-superagent':`link:${source}`,'sentiscope-runtime':`link:${runtime}`,'sentiscope-artifact-cold-check':`link:${consumer}`},dsh:{profile:{bundles:[]}}});
 save(resolve(profile,'cordis.patch.yml'),[{insert:[...services,{id:'probe',name:'sentiscope-artifact-cold-check',config:{root,phase,output:resolve(root,`${phase}-result.json`),prior:resolve(root,'first-result.json')}}]}]);
}
const env=Object.fromEntries(['PATH','LANG','LC_ALL','TMPDIR','SYSTEMROOT'].flatMap(key=>process.env[key]?[[key,process.env[key]]]:[]));Object.assign(env,{DSH_HOME:home,CI:'true'});
const startedAt=Date.now(),deadline=startedAt+45000,cli=resolve(sdk,'node_modules/@deepseek-ai/dsh/lib/bin.js');
const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));let active;
function start(phase){
 const descriptors=[openSync(resolve(root,`${phase}.stdout`),'wx',0o600),openSync(resolve(root,`${phase}.stderr`),'wx',0o600)],args=[cli,'--profile',phase];
 const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore',...descriptors]});
 const entry={child,exited:false,record:{phase,pid:child.pid,argv:[process.execPath,...args],cwd:root,startedAt:new Date().toISOString(),inheritedCredentialEnvironment:false}};
 entry.done=new Promise(accept=>{child.once('error',error=>{entry.record.error=error.message;});child.once('close',(code,signal)=>{entry.exited=true;Object.assign(entry.record,{code,signal,endedAt:new Date().toISOString()});descriptors.forEach(closeSync);save(resolve(root,`${phase}-process.json`),entry.record);accept(entry.record);});});
 active=entry;return entry;
}
async function report(entry,timeout){const end=Math.min(deadline,Date.now()+timeout),path=resolve(root,`${entry.record.phase}-result.json`);while(Date.now()<end){if(existsSync(path))return JSON.parse(readFileSync(path));if(entry.exited)throw Error(`${entry.record.phase} process exited without a report`);await pause(25);}entry.record.timedOut=true;throw Error(`${entry.record.phase} report timed out`);}
const result={status:'FAIL',scope:'Two separate official product Host processes; deliberate SIGKILL before one-shot due, unassisted overdue recovery through native Schedule; local synthetic Provider only',root,checks:[],phases:[]};
const killGuard=setTimeout(()=>{if(active&&!active.exited){active.record.deadlineTermination={signal:'SIGKILL',at:new Date().toISOString(),reason:'Owned engineering check exceeded45s'};active.child.kill('SIGKILL');}},45000);
try{
 const first=start('first'),ready=await report(first,12000);assert.equal(ready.status,'READY',JSON.stringify(ready.error));assert.equal(ready.pid,first.child.pid);assert.equal(first.exited,false);assert.ok(Date.now()<Date.parse(ready.followup.trigger.at),'First Host must crash before the original observation deadline');
 first.record.terminationRequested={signal:'SIGKILL',at:new Date().toISOString(),reason:'Only this driver-owned Host, after native/SQLite readiness; no graceful product cleanup'};assert.equal(first.child.kill('SIGKILL'),true);const firstExit=await first.done;assert.equal(firstExit.signal,'SIGKILL');assert.equal(firstExit.code,null);result.phases.push({phase:'first',status:'READY_THEN_SIGKILL',report:resolve(root,'first-result.json'),process:firstExit});
 const past=Date.parse(ready.followup.trigger.at)+150;while(Date.now()<past){assert.ok(Date.now()<deadline);await pause(Math.min(50,past-Date.now()));}
 result.checks.push('Owned first Host was SIGKILLed only after exact artifact, follow-up, Session, native tasks and authoritative usage were persisted; original one-shot becomes overdue while no Host runs');
 const cold=start('cold'),restored=await report(cold,18000);assert.equal(restored.status,'PASS',JSON.stringify(restored.error));const coldExit=await cold.done;assert.equal(coldExit.code,0);assert.equal(coldExit.signal,null);assert.notEqual(coldExit.pid,firstExit.pid);result.phases.push({phase:'cold',status:'PASS',report:resolve(root,'cold-result.json'),process:coldExit});result.checks.push(...restored.checks);result.requestCount=(ready.requests?.length??0)+(restored.requests?.length??0);result.status='PASS';
}catch(error){result.error={name:error.name,message:error.message,stack:error.stack};}
finally{clearTimeout(killGuard);if(active&&!active.exited){active.record.cleanupRequested={signal:'SIGKILL',at:new Date().toISOString(),reason:'Only the driver-owned failing engineering child'};active.child.kill('SIGKILL');await active.done;}result.elapsedMilliseconds=Date.now()-startedAt;const after=identity();save(resolve(root,'identity-after.json'),after);result.changedCandidateBytes=before.files.filter((file,index)=>file.sha256!==after.files[index].sha256).map(file=>file.path);result.sdkIdentityChanged=JSON.stringify(before.sdk)!==JSON.stringify(after.sdk);result.probeStatus=result.status;if(result.status==='PASS'&&(result.changedCandidateBytes.length||result.sdkIdentityChanged))result.status='INCONCLUSIVE_CANDIDATE_CHANGED';result.limitations=['One-shot is overdue; normal heartbeat may still be future. Separate independent checks cover both being overdue','No manual Schedule run/edit/create or follow-up prompt is issued by the cold fixture','Only explicit local synthetic transport, no real model or enterprise data','Compute remains unavailable; Call deferred; no isolation/production acceptance claim'];save(resolve(root,'runner-result.json'),result);}
console.log(`${result.status}: ${resolve(root,'runner-result.json')}`);if(result.status!=='PASS')process.exitCode=1;
