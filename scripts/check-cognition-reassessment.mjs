import{spawn}from'node:child_process';
import{mkdirSync,writeFileSync,readFileSync,copyFileSync,symlinkSync,openSync,closeSync,readdirSync}from'node:fs';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{createHash,randomUUID}from'node:crypto';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length>2)throw Error('This isolated engineering check takes no external configuration or credentials');
process.umask(0o077);
const root=resolve(project,'.local/cognition-reassessment-checks',`run-${Date.now()}-${randomUUID()}`),home=resolve(root,'home'),consumer=resolve(root,'consumer'),source=resolve(project,'.local/official-sdk/superagent'),runtime=resolve(project,'runtime'),sdk=resolve(project,'.local/official-sdk/harness');
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceFiles=directory=>readdirSync(resolve(project,directory),{withFileTypes:true}).flatMap(entry=>entry.name==='node_modules'||entry.name==='locks'?[]:entry.isDirectory()?sourceFiles(`${directory}/${entry.name}`):entry.isFile()&&/\.(ts|mjs|js|json|html|css|svg)$/.test(entry.name)?[`${directory}/${entry.name}`]:[]);
const productFiles=()=>[...sourceFiles('src'),...sourceFiles('runtime'),'package.json','package-lock.json','tsconfig.json','runtime/locks/identity.json','scripts/check-cognition-reassessment.mjs','scripts/runtime/cognition-reassessment-probe.mjs'].sort();
const identity=()=>({at:new Date().toISOString(),node:process.version,files:productFiles().map(path=>({path,sha256:digest(resolve(project,path))})),sdk:{harness:JSON.parse(readFileSync(resolve(sdk,'node_modules/@deepseek-ai/dsh/package.json'),'utf8')).version,schedule:JSON.parse(readFileSync(resolve(sdk,'node_modules/@deepseek-ai/dsh-schedule/package.json'),'utf8')).version,publicRootSha256:digest(resolve(source,'lib/index.js')),sourceManifestSha256:digest(resolve(source,'package.json')),sourceLockSha256:digest(resolve(source,'pnpm-lock.yaml'))}});
mkdirSync(resolve(consumer,'node_modules'),{recursive:true,mode:0o700});const before=identity();save(resolve(root,'identity-before.json'),before);
copyFileSync(resolve(project,'scripts/runtime/cognition-reassessment-probe.mjs'),resolve(consumer,'index.mjs'));
for(const[name,target]of[['dsh-superagent',source],['sentiscope-runtime',runtime]])symlinkSync(target,resolve(consumer,'node_modules',name));
save(resolve(consumer,'package.json'),{name:'sentiscope-cognition-reassessment-check',private:true,type:'module',main:'index.mjs',peerDependencies:{'@deepseek-ai/dsh-llm':'0.2.2-rc.3','@deepseek-ai/dsh-session':'0.2.2-rc.3','@deepseek-ai/dsh-schedule':'0.2.2-rc.3'},dependencies:{'dsh-superagent':`link:${source}`,'sentiscope-runtime':`link:${runtime}`}});
const profile=resolve(home,'profiles/check');mkdirSync(resolve(profile,'node_modules'),{recursive:true,mode:0o700});
for(const[name,target]of[['dsh-superagent',source],['sentiscope-runtime',runtime],['sentiscope-cognition-reassessment-check',consumer]])symlinkSync(target,resolve(profile,'node_modules',name));
save(resolve(profile,'package.json'),{name:'sentiscope-cognition-reassessment-profile',private:true,type:'module',dependencies:{'dsh-superagent':`link:${source}`,'sentiscope-runtime':`link:${runtime}`,'sentiscope-cognition-reassessment-check':`link:${consumer}`},dsh:{profile:{bundles:[]}}});
const vault=resolve(root,'private/credentials.yaml');mkdirSync(dirname(vault),{recursive:true,mode:0o700});
const services=[['credentials','dsh-credentials-local',{path:vault,watch:false}],['llm','dsh-llm'],['session','dsh-session'],['projection','dsh-session-projection'],['prompt','dsh-system-prompt'],['tools','dsh-tools'],['executor','dsh-tool-executor-native'],['agent','dsh-agent'],['loop','dsh-agent-loop'],['persistence','dsh-session-persistence-jsonl',{root:resolve(root,'native/sessions'),compression:'none'}],['storage','dsh-storage'],['json','dsh-storage-json',{root:resolve(root,'native/storage')}],['domain','dsh-storage-domain',{backend:'json'}],['schedule','dsh-schedule']].map(([id,name,config])=>({id,name:`@deepseek-ai/${name}`,...(config?{config}:{})}));
save(resolve(profile,'cordis.patch.yml'),[{insert:[...services,{id:'probe',name:'sentiscope-cognition-reassessment-check',config:{root,output:resolve(root,'result.json')}}]}]);
const env=Object.fromEntries(['PATH','LANG','LC_ALL','TMPDIR','SYSTEMROOT'].flatMap(key=>process.env[key]?[[key,process.env[key]]]:[]));env.DSH_HOME=home;
const cli=resolve(sdk,'node_modules/@deepseek-ai/dsh/lib/bin.js'),args=[cli,'--profile','check'];
const descriptors=[openSync(resolve(root,'stdout.txt'),'wx',0o600),openSync(resolve(root,'stderr.txt'),'wx',0o600)];
const command={argv:[process.execPath,...args],cwd:root,startedAt:new Date().toISOString(),inheritedCredentialEnvironment:false,syntheticOnly:true};save(resolve(root,'process-started.json'),command);
const child=spawn(process.execPath,args,{cwd:root,env,stdio:['ignore',...descriptors]});let timedOut=false,killTimer;
const timer=setTimeout(()=>{timedOut=true;child.kill('SIGINT');killTimer=setTimeout(()=>child.kill('SIGKILL'),5000);},80000);
let exit;try{exit=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}));});}catch(error){exit={code:null,signal:null,error:error.message};}finally{clearTimeout(timer);clearTimeout(killTimer);descriptors.forEach(closeSync);}
save(resolve(root,'process.json'),{...command,...exit,timedOut,endedAt:new Date().toISOString()});
const after=identity();save(resolve(root,'identity-after.json'),after);const oldHashes=new Map(before.files.map(file=>[file.path,file.sha256])),newHashes=new Map(after.files.map(file=>[file.path,file.sha256]));const changed=[...new Set([...oldHashes.keys(),...newHashes.keys()])].filter(path=>oldHashes.get(path)!==newHashes.get(path));
let report;try{report=JSON.parse(readFileSync(resolve(root,'result.json'),'utf8'));}catch{report={status:'FAIL',error:'No probe result; inspect private stdout/stderr'};}
const sdkIdentityChanged=JSON.stringify(before.sdk)!==JSON.stringify(after.sdk);const status=exit.code!==0||timedOut||report.status!=='PASS'?'FAIL':sdkIdentityChanged?'INCONCLUSIVE_SDK_CHANGED':changed.length?'INCONCLUSIVE_CANDIDATE_CHANGED':'PASS';
save(resolve(root,'runner-result.json'),{status,scope:report.scope,probe:report.status,checks:report.checks??[],requestCount:report.requestCount??null,changedProductBytes:changed,sdkIdentityChanged,process:exit,timedOut,error:report.error??null,limitations:['Explicit local synthetic Provider and synthetic files only; no enterprise data or real model','The due one-shot Schedule is resolved through the official public run API for deterministic timing; elapsed wall-clock autonomy is covered separately by the native Schedule probe','Compute remains unavailable; no process/network isolation claim','Graceful product Host reopen is not an OS crash or backup-recovery proof','No SDK source changes, installation, deployment or external notifications']});
console.log(`${status}: ${resolve(root,'runner-result.json')}`);if(status!=='PASS')process.exitCode=1;
