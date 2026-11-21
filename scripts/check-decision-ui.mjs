import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {ArtifactStore} from '../src/artifacts.ts';
import {DecisionStore} from '../src/decisions.ts';
import {startLocalHost} from '../src/server.ts';

// Actual browser/HTTP/business SQLite. The only interpretation is an explicit synthetic
// fixture below: no model, SDK runtime, enterprise source, compute or external sender.
const exec=promisify(execFile),root=resolve('.local/operator-decision-ui-checks');mkdirSync(root,{recursive:true});
const output=mkdtempSync(join(root,'run-')),session=`sentiscope-decision-ui-${randomUUID()}`;
const owner={enterpriseId:'decision-ui-fixture',principalId:'operator'},store=new SentiStore({filename:join(output,'business.sqlite')});
const delegation=store.create(owner,{goal:'合成经营取舍的完整交互核验',boundary:'仅本地合成工程验证，不执行经营动作',idempotencyKey:'fixture-delegation'});
const binding={owner,delegationId:delegation.id,goalRevision:1,epoch:0,generation:1,role:'main'};
const current=()=>store.scope(owner,delegation.id).lifecycle==='active';
const artifacts=new ArtifactStore(store,{owner,delegationId:delegation.id},{isCurrent:current,verifyEvidence:async()=>{}});
const decisions=new DecisionStore(store,{owner,delegationId:delegation.id},{isCurrent:current,currentEpoch:()=>0,isArtifactCurrent:(ref,q)=>artifacts.isCurrentBusinessReference(ref,q),verifyArtifact:(b,ref)=>artifacts.read(b,ref)});
const plan=(title)=>({kind:'plan',title,summary:'合成方案用于核对准确版本和选择范围。',evidence:[],assumptions:[],unknowns:['尚未核验经营效果'],applicability:'仅合成工程材料',invalidatedBy:['新的合成证据改变范围'],recommendation:'只核对有限范围',alternatives:[{option:'有限范围核对',costs:'合成注意力',risks:'效果未知'}],constraints:['不执行真实动作'],observation:{baseline:'未知',expectedChange:'未知',measure:'合成检查',window:'下次合成复查',source:'无企业资料',check:'核对新信息'}});
const publish=(requestId,content,previous)=>artifacts.save(binding,{requestId,reason:'合成浏览器版本核对',expectedVersion:previous?.version??0,...(previous?{artifactId:previous.artifactId}:{}),content});
const a1=await publish('plan-a-v1',plan('合成方案 A 第一版'));
const input=(artifact,title,window)=>({requestId:randomUUID(),expectedRevision:0,artifact:{artifactId:artifact.artifactId,version:artifact.version},title,question:'是否只采纳合成范围 A 的核对建议？',options:[{id:'limited',label:'只核对合成范围 A',scope:'仅合成范围 A，不涉及其他部分',costs:'合成核对时间',risks:'尚未证明经营价值'}],recommendation:{optionId:'limited',reason:'有限依据支持有限范围'},unknowns:['效果与实际执行均未知'],nondecisionImpact:'相关取舍等待；独立研究继续',nextActions:['继续核对不依赖该选择的反证'],window,reason:'必须由经营者决定范围'});
const first=await decisions.save(binding,input(a1,'历史待决 A 第一版',{basis:'旧版合成窗口',nextReviewAt:'2099-01-02T00:00:00Z'}));
const a2=await publish('plan-a-v2',plan('合成方案 A 第二版'),a1);
const a=await decisions.save(binding,{...input(a2,'合成待决 A：明确部分采纳',{basis:'没有可靠截止依据；保留复查点',nextReviewAt:'2099-01-02T00:00:00Z'}),id:first.id,expectedRevision:1});
const bPlan=await publish('plan-b-v1',plan('合成方案 B 第一版'));
const b=await decisions.save(binding,input(bPlan,'合成待决 B：明确采纳推荐范围',{remindAt:'2099-01-02T00:00:00Z',decideBy:'2099-01-03T00:00:00Z',executeBy:'2099-01-04T00:00:00Z',basis:'仅合成时间依据，不是现实期限',nextReviewAt:'2099-01-02T00:00:00Z'}));
const projection=()=>{const values=decisions.list();return{researchStatus:{status:'following',reason:'合成本地交互夹具，无模型研究'},decisions:values,decisionResponses:values.flatMap(value=>value.responses),operatorChoices:decisions.choices(),pendingDecisions:values.filter(value=>value.qualification==='current'&&['pending','deferred'].includes(value.status)).map(({id,revision,title,question,artifact})=>({id,revision,title,question,artifact})),artifactRevisions:artifacts.history().map(value=>({...value,qualification:'current'})),research:[],artifacts:[],followups:[],sources:[],outcomeFeed:{choices:decisions.choices().map(choice=>({...choice,qualification:'current'})),executions:[],observations:[]}};};
const host=await startLocalHost({ allowUnauthenticated: true, store,owner,researchPort:{status:{status:'configured',message:'本地合成 UI 工程检查；未配置或调用模型'},detail:projection,changed(){},async respondDecision(_id,input){await artifacts.read(binding,input.artifact);return decisions.respond(input);}}});
const commands=[];let error;
async function browser(...args){try{const result=await exec('agent-browser',['--session',session,...args],{timeout:35000,maxBuffer:2*1024*1024});commands.push({args,...result,exitCode:0});return result.stdout.trim();}catch(cause){commands.push({args,stdout:cause.stdout,stderr:cause.stderr,exitCode:cause.code,signal:cause.signal});throw cause;}}
async function click(selector){await browser('scrollintoview',selector);await browser('click',selector);}
async function truth(expression){assert.equal(await browser('eval','-b',Buffer.from(expression).toString('base64')),'true',expression);}
const selector=(action,entry)=>`[data-action="${action}"][data-id="${entry.id}"][data-revision="${entry.revision}"]`;
try{
 await browser('open',host.url);await browser('wait','--fn','document.querySelector("#reminder-count")?.textContent === "2"');
 await browser('snapshot','-i');await truth('document.querySelector("#screen").textContent.includes("2 项待决")');
 await click('[data-action="reminder-open"]');await browser('wait','--fn','Boolean(document.querySelector(".decision-card"))');
 await browser('snapshot','-i');await truth('document.querySelector("#screen").textContent.includes("暂无硬性截止") && document.querySelector("#screen").textContent.includes("最迟有效决定时间") && document.querySelector("#screen").textContent.includes("执行期限")');
 await truth(`Array.from(document.querySelectorAll('[data-id="${first.id}"][data-revision="1"][data-action^="decision-"]')).every(element=>element.disabled)`);
 await click('details[data-disclosure="decision-history"] > summary');
 await click(`[data-action="artifact-open"][data-artifact="${a1.artifactId}"][data-plan-version="1"]`);
 await browser('wait','--fn',`document.activeElement.dataset.artifactId === '${a1.artifactId}' && document.activeElement.dataset.artifactVersion === '1'`);
 const exactHistorical=`document.activeElement.dataset.artifactId === '${a1.artifactId}' && document.activeElement.dataset.artifactVersion === '1' && document.activeElement.textContent.includes('合成方案 A 第一版') && document.activeElement.getBoundingClientRect().top >= document.querySelector('#service-status').getBoundingClientRect().bottom - 1 && document.activeElement.closest('details')?.open === true && Array.from(document.activeElement.querySelectorAll('details')).every(element=>element.open)`;
 await truth(exactHistorical);await browser('wait','5500');await truth(exactHistorical);await browser('screenshot',join(output,'exact-historical-v1.png'));
 await click('#tab-decisions');await click(`[data-action="artifact-open"][data-artifact="${bPlan.artifactId}"][data-plan-version="1"]`);
 await browser('wait','--fn',`document.activeElement.dataset.artifactId === '${bPlan.artifactId}' && document.activeElement.dataset.artifactVersion === '1'`);
 await truth(`document.activeElement.textContent.includes('合成方案 B 第一版') && document.activeElement.dataset.artifactId !== '${a1.artifactId}'`);
 await click('#tab-decisions');
 await click(selector('decision-acknowledge',a));await browser('wait','--fn',`document.querySelector('${selector('decision-acknowledge',a)}')?.disabled === true`);
 assert.equal(decisions.get(a.id,a.revision).status,'pending');assert.equal(decisions.choices().length,0);await truth('document.querySelector("#screen").textContent.includes("已知悉 · 仍待决")');
 await click(selector('decision-reply',a));await browser('fill','#decision-note','只部分采纳：仅合成范围 A 的第一段，其他部分暂不采纳。');
 await browser('wait','5500');await truth('document.querySelector("#modal").open && document.activeElement.id === "decision-note" && document.activeElement.value === "只部分采纳：仅合成范围 A 的第一段，其他部分暂不采纳。"');
 await click('#decision-reply-form button[type="submit"]');await browser('wait','--fn','!document.querySelector("#modal").open && document.querySelector("#screen").textContent.includes("原话已保存")');
 const response=decisions.get(a.id,a.revision).responses.find(value=>value.action==='reply');assert.ok(response);assert.deepEqual(response.actor,owner);assert.equal(response.artifact.version,2);assert.equal(decisions.choices().length,0);
 // This fixture stands in for an Agent tool result; it does not validate natural-language understanding.
 await decisions.interpret(binding,{responseId:response.responseId,requestId:'fixture-partial-interpretation',action:'partial',optionId:'limited',scope:'仅合成范围 A 的第一段',reason:'显式合成解释替身，用于检验原话与准确版本保存；不是模型质量验证'});
 await browser('wait','--fn','document.querySelector("#screen").textContent.includes("已部分采纳")');
 assert.equal(decisions.choices()[0].artifact.version,2);assert.equal(decisions.choices()[0].scope,'仅合成范围 A 的第一段');assert.equal(decisions.get(a.id,1).choices.length,0);
 await click(selector('decision-adopt',b));await browser('wait','--fn','document.querySelector("#screen").textContent.includes("已采纳")');
 const choices=decisions.choices();assert.equal(choices.length,2);assert.equal(choices[1].artifact.artifactId,bPlan.artifactId);assert.equal(choices[1].scope,b.options[0].scope);assert.equal(choices[1].source,'explicit');
 await click('#tab-results');await truth('document.querySelector("#screen").textContent.includes("尚无执行反馈") && document.querySelector("#screen").textContent.includes("不等于实际执行")');
 await click('#tab-decisions');await click(`[data-action="artifact-open"][data-artifact="${a2.artifactId}"][data-plan-version="2"]`);
 await browser('wait','--fn',`document.activeElement.dataset.artifactId === '${a2.artifactId}' && document.activeElement.dataset.artifactVersion === '2'`);
 const a3=await publish('plan-a-v3-during-reading',plan('合成方案 A 第三版'),a2);await browser('wait','5500');
 await truth(`document.activeElement.dataset.artifactId === '${a2.artifactId}' && document.activeElement.dataset.artifactVersion === '2' && document.activeElement.closest('details')?.open === true && document.activeElement.getBoundingClientRect().top >= document.querySelector('#service-status').getBoundingClientRect().bottom - 1 && document.activeElement.getBoundingClientRect().top < innerHeight && document.activeElement.textContent.includes('合成方案 A 第二版')`);
 await browser('screenshot',join(output,'exact-v2-after-v3-poll.png'));
 await click('details[data-disclosure="artifact-history"] > summary');
 const basis3=`[data-artifact-id="${a3.artifactId}"][data-artifact-version="3"] details[data-disclosure="artifact:${a3.artifactId}:3:basis"] > summary`;
 await browser('scrollintoview',basis3);await browser('focus',basis3);
 await truth(`document.activeElement.closest('details')?.open === false && document.activeElement.closest('[data-artifact-id]')?.dataset.artifactVersion === '3'`);
 const a4=await publish('plan-a-v4-during-basis-reading',plan('合成方案 A 第四版'),a3);await browser('wait','5500');
 await truth(`document.activeElement.tagName === 'SUMMARY' && document.activeElement.closest('[data-artifact-id]')?.dataset.artifactId === '${a3.artifactId}' && document.activeElement.closest('[data-artifact-id]')?.dataset.artifactVersion === '3' && document.activeElement.closest('details')?.open === false && document.activeElement.closest('details')?.parentElement?.closest('details')?.open === true && document.activeElement.getBoundingClientRect().top >= document.querySelector('#service-status').getBoundingClientRect().bottom - 1 && document.activeElement.getBoundingClientRect().top < innerHeight`);
 await browser('screenshot',join(output,'exact-v3-basis-summary-after-v4-poll.png'));
 await truth(`document.querySelector('details[data-disclosure="artifact-history"]').open === true`);
 const card4=`[data-artifact-id="${a4.artifactId}"][data-artifact-version="4"]`;
 await browser('scrollintoview',card4);await browser('focus',card4);
 const a5=await publish('plan-a-v5-history-already-open',plan('合成方案 A 第五版'),a4);await browser('wait','5500');
 await truth(`document.activeElement.dataset.artifactId === '${a4.artifactId}' && document.activeElement.dataset.artifactVersion === '4' && document.activeElement.closest('details')?.open === true && document.activeElement.getBoundingClientRect().top >= document.querySelector('#service-status').getBoundingClientRect().bottom - 1 && document.activeElement.getBoundingClientRect().top < innerHeight`);
 await browser('screenshot',join(output,'exact-v4-card-open-history-after-v5-poll.png'));
 const basis5=`[data-artifact-id="${a5.artifactId}"][data-artifact-version="5"] details[data-disclosure="artifact:${a5.artifactId}:5:basis"] > summary`;
 await browser('scrollintoview',basis5);await browser('focus',basis5);
 await truth(`document.activeElement.closest('details')?.open === false && document.querySelector('details[data-disclosure="artifact-history"]').open === true`);
 await publish('plan-a-v6-basis-history-already-open',plan('合成方案 A 第六版'),a5);await browser('wait','5500');
 await truth(`document.activeElement.tagName === 'SUMMARY' && document.activeElement.closest('[data-artifact-id]')?.dataset.artifactId === '${a5.artifactId}' && document.activeElement.closest('[data-artifact-id]')?.dataset.artifactVersion === '5' && document.activeElement.closest('details')?.open === false && document.activeElement.closest('details')?.parentElement?.closest('details')?.open === true && document.activeElement.getBoundingClientRect().top >= document.querySelector('#service-status').getBoundingClientRect().bottom - 1 && document.activeElement.getBoundingClientRect().top < innerHeight`);
 await browser('screenshot',join(output,'exact-v5-basis-open-history-after-v6-poll.png'));


 await click('#tab-decisions');if(await browser('eval','document.documentElement.dataset.theme')==='"dark"')await click('#theme-toggle');await truth('document.documentElement.dataset.theme === "light"');await browser('screenshot',join(output,'desktop-light.png'));
 await click('#theme-toggle');await truth('document.documentElement.dataset.theme === "dark"');await browser('screenshot',join(output,'desktop-dark.png'));
 await browser('set','viewport','390','844');await truth('document.documentElement.scrollWidth <= innerWidth');await browser('screenshot',join(output,'mobile-dark.png'));
 assert.equal(await browser('errors'),'');
 writeFileSync(join(output,'business-proof.json'),`${JSON.stringify({owner,delegationId:delegation.id,decisions:decisions.list(),choices:decisions.choices(),scope:'actual browser + HTTP + SQLite; synthetic interpretation only; no real model, enterprise data, execution or SDK runtime'},null,2)}\n`);
}catch(cause){error={name:cause.name,message:cause.message};}
finally{await browser('close').catch(()=>{});await host.close();store.close();writeFileSync(join(output,'result.json'),`${JSON.stringify({status:error?'FAIL':'PASS',error,commands},null,2)}\n`);}
console.log(`${error?'FAIL':'PASS'}: ${output}`);if(error)process.exitCode=1;
