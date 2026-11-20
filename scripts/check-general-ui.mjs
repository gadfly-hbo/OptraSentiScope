import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {SentiStore} from '../src/store.ts';
import {startLocalHost} from '../src/server.ts';

const exec=promisify(execFile),project=resolve('.'),root=resolve('.local/general-ui-checks');mkdirSync(root,{recursive:true});
const identity={node:process.version,gitHead:execFileSync('git',['-C',project,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['-C',project,'status','--porcelain'],{encoding:'utf8'}).trim().length>0,files:['package.json','src/server.ts','src/web/app.js','src/web/styles.css','scripts/check-general-ui.mjs'].map(path=>({path,sha256:createHash('sha256').update(readFileSync(resolve(project,path))).digest('hex')}))};
const output=mkdtempSync(join(root,'run-')),session=`sentiscope-general-ui-${randomUUID()}`,commands=[];
const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'general-ui-fixture',principalId:'operator'},delegation=store.create(owner,{goal:'一句话建立并补全摘要',idempotencyKey:'create'});
let control={revision:0,researchPaused:false,collectionPaused:false,pausedScopes:[],updatedAt:new Date().toISOString()},preferences={timeZone:'UTC',time:'17:00:00',weekdays:[1,2,3,4,5],revision:1};
const projection=()=>({researchStatus:{status:'following'},intake:{status:'current',pendingQuestions:[{id:'metric',question:'目标值是多少？',impact:'影响达成评价',blockingScopes:['目标达成评价'],status:'pending'}],summary:{id:'intake',revision:1,createdAt:new Date().toISOString(),qualification:'current',content:{objective:'先提升复购而不执行经营动作',facts:['获准资料说明现状'],assumptions:['先研究'],reusableExperiences:[],researchAuthorization:['仅读取获准来源'],businessBoundary:['不执行动作'],evaluation:['目标值未明前做现状研究'],followUp:['继续独立研究'],unknowns:['目标值未知'],questions:[]}}},lifecycleControls:{status:control,plans:[{id:'plan-end',kind:'end',at:'2099-01-01T00:00:00.000Z',reason:'有效期到',status:'active',schedule:{status:'active'}}]},notificationFeed:{matters:[],briefs:[],notices:[],checkState:null},notificationPreferences:preferences});
const host=await startLocalHost({store,owner,port:0,researchPort:{status:{status:'configured',message:'本地合成 UI'},detail:projection,changed(){},pauseResearch(_id,input){control={...control,revision:control.revision+1,researchPaused:true,pausedScopes:[input.scope??''],updatedAt:new Date().toISOString()};return control;},resumeResearch(_id,input){control={...control,revision:control.revision+1,researchPaused:false,pausedScopes:input.scope?control.pausedScopes.filter(scope=>scope!==input.scope):[],updatedAt:new Date().toISOString()};return control;},async scheduleResume(){return{kind:'resume'};},async scheduleEnd(){return{kind:'end'};},configureNotificationPreferences(_id,input,expectedRevision){preferences={...input,revision:expectedRevision+1};return preferences;}}});
async function browser(...args){try{const result=await exec('agent-browser',['--session',session,...args],{timeout:35000,maxBuffer:2*1024*1024});commands.push({args,stdout:result.stdout,stderr:result.stderr,exitCode:0});return result.stdout.trim();}catch(error){commands.push({args,stdout:error.stdout,stderr:error.stderr,exitCode:error.code,signal:error.signal});throw error;}}
let error;
try{
 await browser('set','viewport','1440','1000');await browser('open',`${host.url}#delegation/${delegation.id}/progress`);await browser('wait','--fn','document.querySelector("#screen").textContent.includes("委托摘要")');
 await browser('wait','--fn','document.querySelector("#screen").textContent.includes("目标值是多少？")');await browser('snapshot','-i');
 await browser('click','[data-action="research-control"]');await browser('select','#lifecycle-action','pause');await browser('select','#lifecycle-mode','direction');await browser('fill','#lifecycle-scope','复购提升');await browser('fill','#lifecycle-reason','等待目标值');await browser('click','#lifecycle-form button[type="submit"]');
 await browser('wait','--fn','document.querySelector("#screen").textContent.includes("暂停方向：复购提升")');
 await browser('eval',`document.querySelector('#preferences-form').closest('details').querySelector('summary').click()`);
 await browser('wait','--fn',`document.querySelector('#preferences-form')?.closest('details').open === true`);
 // The browser driver fill command does not reliably set a native time input.
 await browser('eval',`(() => { const input = document.querySelector('#preference-time'); input.focus(); input.value = '09:00'; input.dispatchEvent(new Event('input', {bubbles:true})); return input.value; })()`);
 await browser('check','#preferences-form input[value="6"]');
 await browser('wait','5500');
 const edited=await browser('eval',`document.querySelector('#preferences-form').closest('details').open && document.querySelector('#preference-time').value === '09:00' && document.querySelector('#preferences-form input[value="6"]').checked`);
 assertBrowser(edited,'true');
 await browser('eval',`document.querySelector('#preferences-form button[type="submit"]').click()`);
 await browser('wait','--fn',`document.querySelector('#preferences-form')?.dataset.revision === '2' && document.querySelector('#preference-time')?.value === '09:00' && document.querySelector('#preferences-form input[value="6"]')?.checked === true`);
 assertBrowser(JSON.stringify(preferences),JSON.stringify({timeZone:'UTC',time:'09:00:00',weekdays:[1,2,3,4,5,6],revision:2}));
 await browser('set','viewport','390','844');await browser('wait','--fn','document.documentElement.scrollWidth<=innerWidth');await browser('screenshot',join(output,'mobile.png'));assertBrowser(await browser('errors'),'');
  writeFileSync(join(output,'result.json'),JSON.stringify({status:'PASS',identity,commands,control,preferences,hostURL:host.url},null,2)+'\n');
}catch(cause){error={name:cause.name,message:cause.message};writeFileSync(join(output,'result.json'),JSON.stringify({status:'FAIL',error,commands,control,preferences},null,2)+'\n');}
finally{await browser('close').catch(()=>{});await host.close();store.close();}
const result=JSON.parse(readFileSync(join(output,'result.json'),'utf8'));console.log(`${result.status}: ${output}`);if(result.status!=='PASS')process.exitCode=1;
function assertBrowser(value,expected){if(value!==expected)throw Error(`browser errors: ${value}`);}
