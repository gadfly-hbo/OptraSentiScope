import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import {DecisionStore} from '../src/decisions.ts';
import {NotificationStore} from '../src/notifications.ts';
import {startLocalHost} from '../src/server.ts';

// Actual browser, HTTP and business SQLite only. Clock and qualifications below are
// explicit synthetic fixtures; this does not run a model, native timer or connector.
const exec=promisify(execFile),root=resolve('.local/notification-ui-checks');mkdirSync(root,{recursive:true});
const output=mkdtempSync(join(root,'run-')),session=`sentiscope-notification-ui-${randomUUID()}`;
const owner={enterpriseId:'notification-ui-fixture',principalId:'operator'},store=new SentiStore({filename:join(output,'business.sqlite')});
let now='2026-11-17T16:50:00.000Z',writes=0;
const units=new Map();
const plan={kind:'plan',title:'合成方案：有限范围核对',summary:'只验证站内简报与提醒的读取，不表示经营判断正确。',evidence:[],assumptions:[],unknowns:['经营效果与语言理解未验证'],applicability:'本地合成 UI',invalidatedBy:['资料资格或方案改变'],recommendation:'仅核对合成范围',alternatives:[{option:'继续补证',costs:'未知',risks:'未知'}],constraints:['不执行经营动作'],observation:{baseline:'未知',expectedChange:'未知',measure:'合成检查',window:'合成时钟',source:'没有企业资料',check:'核对准入及站内事实'}};
async function makeUnit(key,goal){
 const delegation=store.create(owner,{goal,boundary:'合成 UI 验证，不运行模型或计算',idempotencyKey:key});let epoch=0;
 const binding={owner,delegationId:delegation.id,goalRevision:1,epoch:0,generation:1,role:'main'},current=b=>store.scope(owner,delegation.id).lifecycle==='active'&&b.epoch===epoch;
 const artifacts=new ArtifactStore(store,{owner,delegationId:delegation.id},{isCurrent:current,verifyEvidence:async()=>{},now:()=>now});
 const artifact=await artifacts.save(binding,{expectedVersion:0,requestId:'plan',reason:'合成资料的有限交付',content:plan});
 const decisions=new DecisionStore(store,{owner,delegationId:delegation.id},{isCurrent:current,currentEpoch:()=>epoch,isArtifactCurrent:(ref,q)=>artifacts.isCurrentBusinessReference(ref,q),verifyArtifact:(b,ref)=>artifacts.read(b,ref),now:()=>now});
 const notifications=new NotificationStore(store,{owner,delegationId:delegation.id},{isCurrent:current,currentEpoch:()=>epoch,isArtifactCurrent:(ref,q)=>artifacts.isCurrentBusinessReference(ref,q),verifyArtifact:(b,ref)=>artifacts.read(b,ref),decisionCurrent:(ref)=>{const d=decisions.get(ref.id,ref.revision);return Boolean(d&&d.qualification==='current'&&['pending','deferred'].includes(d.status));},verifyDecision:(b,ref)=>decisions.read(b,ref),preferences:()=>({timeZone:'UTC',time:'17:00:00',weekdays:[1,2,3,4,5],revision:1}),now:()=>now});
 const unit={delegation,binding,artifacts,artifact,decisions,notifications,revoke(){epoch++;}};units.set(delegation.id,unit);return unit;
}
const a=await makeUnit('fixture-a','合成持续委托 A：关注变化与取舍'),b=await makeUnit('fixture-b','合成持续委托 B：没有实质变化');
const reference={artifactId:a.artifact.artifactId,version:a.artifact.version};
const base={expectedRevision:0,kind:'inform',artifact:reference,title:'同一持续事项',summary:'第一份合成信息',changes:['首次发现有限线索'],unknowns:['真实效果未知'],mergeReason:'合成来源 A 与 B 指向同一问题',urgency:'brief'};
const first=await a.notifications.save(a.binding,{...base,requestId:'matter-v1'});
const matter=await a.notifications.save(a.binding,{...base,id:first.id,expectedRevision:1,requestId:'matter-v2',title:'同一持续事项的合并更新',summary:'两份信息已经合并，当前只显示这一版。',changes:['新增反证后范围收窄'],urgency:'immediate',immediateReason:'等待下次简报会失去本次关注时间'});
const decisionInput={expectedRevision:0,requestId:'decision-one',artifact:reference,title:'独立经营选择与真实窗口',question:'是否采用有限范围？',options:[{id:'limited',label:'有限范围',scope:'仅合成 A，不包括其他范围',costs:'未知',risks:'仍需核验'}],recommendation:{optionId:'limited',reason:'合成依据有限'},unknowns:['实际执行未知'],nondecisionImpact:'相关取舍等待，独立研究继续',nextActions:['继续独立补证'],window:{remindAt:'2026-11-17T17:05:00.000Z',nextReviewAt:'2026-11-17T17:10:00.000Z',decideBy:'2026-11-17T17:30:00.000Z',executeBy:'2026-11-17T18:00:00.000Z',basis:'仅合成时钟，不是现实经营期限'},reason:'需要经营者明确范围'};
const decision=await a.decisions.save(a.binding,decisionInput);
const secondInput={...decisionInput,requestId:'decision-two',title:'第二项独立经营选择',question:'是否采用第二项有限范围？',options:[{id:'limited',label:'第二项有限范围',scope:'仅第二项，不包括第一项',costs:'未知',risks:'仍需核验'}]};
const secondDecision=await a.decisions.save(a.binding,secondInput);
const decisionMatter=await a.notifications.save(a.binding,{...base,requestId:'decision-matter',kind:'decision',decision:{id:decision.id,revision:decision.revision},title:'独立选择保留为独立事项',summary:'窗口提醒不会替经营者采纳。',changes:['已形成明确的取舍窗口'],mergeReason:'经营选择独立保留，不合并成普通告知'});
now='2026-11-17T17:10:00.000Z';
const immediate=await a.notifications.immediate(a.binding,{id:matter.id,revision:matter.revision,requestId:'important-once'});
const repeated=await a.notifications.immediate(a.binding,{id:matter.id,revision:matter.revision,requestId:'important-again'});assert.equal(repeated.id,immediate.id);
await a.notifications.remind(a.binding,{id:decisionMatter.id,revision:decisionMatter.revision,decision:{id:decision.id,revision:decision.revision},point:'remindAt',at:'2026-11-17T17:05:00.000Z',requestId:'decision-reminder',reason:'合成决策窗口需要复查，暂不决定仍只影响相关取舍'});
await a.notifications.createBrief(a.binding,{requestId:'workday-brief',windowKey:a.notifications.briefWindow().key,summary:'本工作日简报：同一事项已合并，独立经营选择仍需明确回应。'});
const empty=await b.notifications.createBrief(b.binding,{requestId:'no-change',windowKey:b.notifications.briefWindow().key,summary:'EMPTY_BRIEF_MUST_NOT_RENDER'});assert.equal(empty.check.status,'no_change');assert.equal(empty.notice,null);
const projection=id=>{const u=units.get(id);assert.ok(u);const ds=u.decisions.list();return{researchStatus:{status:'unconfigured',reason:'合成本地 UI；无模型或原生调度'},artifactRevisions:u.artifacts.history().map(value=>({...value,qualification:'current'})),decisions:ds,operatorChoices:u.decisions.choices(),pendingDecisions:ds.filter(value=>value.qualification==='current'&&['pending','deferred'].includes(value.status)).map(({id,revision,title,question,artifact})=>({id,revision,title,question,artifact})),notificationFeed:u.notifications.projection(),research:[],artifacts:[],followups:[],sources:[],outcomes:[]};};
const host=await startLocalHost({ allowUnauthenticated: true, store,owner,researchPort:{status:{status:'unconfigured',message:'本地合成 UI；未配置模型、原生调度或企业资料'},detail:projection,changed(){writes++;},async respondDecision(){writes++;throw Error('This read-only browser path must not create an operator choice');}}});
const commands=[];let error;
async function browser(...args){try{const result=await exec('agent-browser',['--session',session,...args],{timeout:35000,maxBuffer:2*1024*1024});commands.push({args,...result,exitCode:0});return result.stdout.trim();}catch(cause){commands.push({args,stdout:cause.stdout,stderr:cause.stderr,exitCode:cause.code,signal:cause.signal});throw cause;}}
async function click(selector){await browser('scrollintoview',selector);await browser('click',selector);}
async function truth(expression){assert.equal(await browser('eval','-b',Buffer.from(expression).toString('base64')),'true',expression);}
try{
 await browser('open',host.url);await browser('wait','--fn','document.querySelector("#screen").textContent.includes("本工作日简报")');await browser('snapshot','-i');
 await truth(`Array.from(document.querySelectorAll('[data-matter-id="${matter.id}"]')).length===1 && document.querySelector('#screen').textContent.includes('新增反证后范围收窄') && document.querySelector('#screen').textContent.includes('工作日核对已记录，暂无实质变化') && !document.querySelector('#screen').textContent.includes('EMPTY_BRIEF_MUST_NOT_RENDER')`);
 const secondHome=`#screen [data-action="reminder-open"][data-decision="${secondDecision.id}"][data-decision-revision="${secondDecision.revision}"]`;
 await click(secondHome);await browser('wait','--fn',`document.activeElement.dataset.decisionId==='${secondDecision.id}' && document.activeElement.dataset.decisionRevision==='${secondDecision.revision}'`);
 await truth(`document.activeElement.textContent.includes('第二项独立经营选择') && document.activeElement.dataset.decisionId!=='${decision.id}' && document.activeElement.getBoundingClientRect().top>=document.querySelector('#service-status').getBoundingClientRect().bottom-1`);
 await browser('wait','5500');await truth(`document.activeElement.dataset.decisionId==='${secondDecision.id}' && document.activeElement.dataset.decisionRevision==='${secondDecision.revision}'`);
 writeFileSync(join(output,'home-second-target-proof.json'),await browser('eval',`({id:document.activeElement.id,tag:document.activeElement.tagName,decisionId:document.activeElement.dataset.decisionId,revision:document.activeElement.dataset.decisionRevision})`)+'\n');await browser('screenshot',join(output,'home-second-entry.png'));
 assert.equal(a.decisions.choices().length,0);assert.equal(writes,0);
 await click('#screen [data-action="overview"]');await browser('wait','--fn','Boolean(document.querySelector("#screen .attention"))');
 await click(`#screen [data-matter-id="${matter.id}"] [data-action="open"]`);await browser('wait','--fn','Boolean(document.querySelector(".detail-heading"))');await browser('snapshot','-i');
 await truth('document.querySelector("#screen").textContent.includes("决策窗口跟进") && document.querySelector("#screen").textContent.includes("站内展示不表示经营者已读或采纳")');
 await click(`[data-action="decision-open"][data-decision="${decision.id}"][data-decision-revision="${decision.revision}"]`);await browser('wait','--fn',`document.activeElement.dataset.decisionId==='${decision.id}' && document.activeElement.dataset.decisionRevision==='${decision.revision}'`);
 await truth(`document.activeElement.id==='decision-${decision.id}-${decision.revision}' && document.activeElement.textContent.includes('独立经营选择与真实窗口') && document.activeElement.getBoundingClientRect().top>=document.querySelector('#service-status').getBoundingClientRect().bottom-1`);
 await browser('wait','5500');await truth(`document.activeElement.dataset.decisionId==='${decision.id}' && document.activeElement.dataset.decisionRevision==='${decision.revision}'`);assert.equal(a.decisions.choices().length,0);assert.equal(writes,0);
 await click('#tab-progress');await click(`#screen [data-matter-id="${matter.id}"] [data-action="artifact-open"][data-artifact="${reference.artifactId}"][data-plan-version="${reference.version}"]`);await browser('wait','--fn',`document.activeElement.dataset.artifactId==='${reference.artifactId}' && document.activeElement.dataset.artifactVersion==='${reference.version}'`);
 await click('#tab-progress');
 const disclosure=`details[data-disclosure="notification:${matter.id}:${matter.revision}"]`;
 await click(`${disclosure} > summary`);await browser('focus',`${disclosure} > summary`);await browser('wait','5500');await truth(`document.querySelector('${disclosure}').open && document.activeElement===document.querySelector('${disclosure} > summary')`);
 if(await browser('eval','document.documentElement.dataset.theme')==='"dark"')await click('[data-action="theme"]');await browser('scrollintoview','[data-notification-feed]');await browser('screenshot',join(output,'desktop-light.png'));await click('[data-action="theme"]');await browser('scrollintoview','[data-notification-feed]');await browser('screenshot',join(output,'desktop-dark.png'));
 await browser('set','viewport','390','844');await truth('document.documentElement.scrollWidth<=innerWidth');await browser('scrollintoview','[data-notification-feed]');await browser('screenshot',join(output,'mobile-dark.png'));
 await click('#screen [data-action="overview"]');await browser('wait','--fn',`Boolean(document.querySelector('${secondHome}'))`);
 await a.decisions.save(a.binding,{...secondInput,id:secondDecision.id,expectedRevision:1,requestId:'decision-two-current',window:{...secondInput.window,nextReviewAt:'2026-11-17T17:15:00.000Z'},reason:'合成更新已替代旧首页引用'});
 await browser('click',secondHome);await browser('wait','--fn','document.querySelector("#screen").textContent.includes("对应待决事项的准确版本当前不可用")');
 await truth(`document.activeElement.id==='main' && document.activeElement.dataset.decisionId!=='${decision.id}' && document.activeElement.dataset.decisionId!=='${secondDecision.id}'`);
 await browser('screenshot',join(output,'stale-home-reference.png'));await click('#tab-progress');
 a.revoke();await browser('wait','--fn','document.querySelector("#screen").textContent.includes("资料资格已变化")');await truth(`!document.querySelector('#screen').textContent.includes('两份信息已经合并，当前只显示这一版。') && !document.querySelector('#screen').textContent.includes('本工作日简报：同一事项已合并') && !document.querySelector('#screen').textContent.includes('合成决策窗口需要复查')`);
 await browser('scrollintoview','[data-notification-feed]');await browser('screenshot',join(output,'qualification-withdrawn.png'));assert.equal(a.decisions.choices().length,0);assert.equal(writes,0);assert.equal(await browser('errors'),'');
 writeFileSync(join(output,'business-proof.json'),JSON.stringify({scope:'actual browser/HTTP/SQLite; synthetic clock and qualification only; no native timer/model/company data/compute',notificationFeed:projection(a.delegation.id).notificationFeed,noChangeFeed:projection(b.delegation.id).notificationFeed,operatorChoices:a.decisions.choices(),humanWriteCalls:writes},null,2)+'\n');
}catch(cause){error={name:cause.name,message:cause.message};}
finally{await browser('close').catch(()=>{});await host.close();store.close();writeFileSync(join(output,'result.json'),JSON.stringify({status:error?'FAIL':'PASS',error,commands},null,2)+'\n');}
console.log(`${error?'FAIL':'PASS'}: ${output}`);if(error)process.exitCode=1;
