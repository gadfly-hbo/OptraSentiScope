import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

/** Isolated DOM at the HTTP-to-screen seam. Only native details semantics used by this regression are modeled. */
async function workspace(decisionData:Record<string,unknown>={}) {
  const listeners=new Map<string,()=>unknown>();const events=new Map<string,(event:{target:Element;preventDefault():void})=>unknown>();const timers:Array<{callback:()=>unknown;delay:number}>=[];let requests=0;let detailGate:Promise<void>|null=null;
  const decode=(value:string)=>value.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  let activeElement:Element|null=null;
  class Element {
    id='';tagName='DIV';dataset:Record<string,string>={};textContent='';className='';disabled=false;isConnected=true;open=false;parent?:Element;details:Details[]=[];artifacts:Element[]=[];decisions:Element[]=[];transients:Element[]=[];scrolled=false;#html='';
    classList={toggle(){}};
    constructor(id=''){this.id=id;}
    get innerHTML(){return this.#html;}
    get parentElement():Element|null{return this.parent??null;}
    set innerHTML(value:string){for(const detail of this.details){detail.isConnected=false;detail.summary.isConnected=false;}for(const artifact of this.artifacts)artifact.isConnected=false;for(const decision of this.decisions)decision.isConnected=false;for(const transient of this.transients)transient.isConnected=false;this.transients=[];this.#html=value;this.details=[];this.artifacts=[];this.decisions=[];const stack:Element[]=[];
      for(const token of value.matchAll(/<details\b([^>]*)>|<summary\b[^>]*>([\s\S]*?)<\/summary>|<\/details>|<li\b([^>]*)>|<\/li>/g)){
        if(token[1]!==undefined){const detail=new Details();detail.parent=stack.at(-1)??this;const key=/\bdata-disclosure="([^"]*)"/.exec(token[1]);if(key)detail.dataset.disclosure=decode(key[1]);detail.open=/\bopen(?:\s|=|$)/.test(token[1]);this.details.push(detail);for(const parent of stack)if(parent.dataset.artifactId)parent.details.push(detail);stack.push(detail);}
        else if(token[2]!==undefined){const parent=stack.at(-1);if(parent instanceof Details)parent.summary.textContent=decode(token[2].replace(/<[^>]*>/g,''));}
        else if(token[3]!==undefined){const element=new Element();element.tagName='LI';element.parent=stack.at(-1)??this;for(const attribute of token[3].matchAll(/data-(artifact-id|artifact-version)="([^"]*)"/g))element.dataset[attribute[1]==='artifact-id'?'artifactId':'artifactVersion']=decode(attribute[2]);if(element.dataset.artifactId)this.artifacts.push(element);stack.push(element);}
        else if((token[0]==='</details>'&&stack.at(-1) instanceof Details)||(token[0]==='</li>'&&stack.at(-1)?.tagName==='LI'))stack.pop();
      }
      for(const match of value.matchAll(/<article\b([^>]*data-decision-id[^>]*)>([\s\S]*?)<\/article>/g)){const element=new Element();element.tagName='ARTICLE';element.parent=this;const id=/\bid="([^"]*)"/.exec(match[1]);element.id=id?decode(id[1]):'';for(const attr of match[1].matchAll(/data-(decision-id|decision-revision)="([^"]*)"/g))element.dataset[attr[1]==='decision-id'?'decisionId':'decisionRevision']=decode(attr[2]);element.textContent=decode(match[2].replace(/<[^>]*>/g,''));this.decisions.push(element);}
    }
    querySelectorAll(selector:'details'|'details[data-disclosure]'):Details[];
    querySelectorAll(selector:string):Element[];
    querySelectorAll(selector:string):Element[]{return selector==='details[data-disclosure]'?this.details.filter(detail=>detail.dataset.disclosure!==undefined):selector==='details'?this.details:selector==='[data-artifact-id][data-artifact-version]'?this.artifacts:[];}
    querySelector(selector:string):Element|null{return selector==='summary'&&this instanceof Details?this.summary:null;}
    closest(selector:string):Element|null{if(selector==='details'||selector==='details[data-disclosure]')return this instanceof Details&&(selector==='details'||this.dataset.disclosure!==undefined)?this:this.parent?.closest(selector)??null;if(selector==='#screen,#mandate-nav')return ['screen','mandate-nav'].includes(this.id)?this:this.parent?.closest(selector)??null;if(selector==='[data-action]')return this.dataset.action?this:this.parent?.closest(selector)??null;if(selector==='[data-artifact-id][data-artifact-version]')return this.dataset.artifactId&&this.dataset.artifactVersion?this:this.parent?.closest(selector)??null;return null;}
    scrollIntoView(){this.scrolled=true;}
    getBoundingClientRect(){return {height:34};}
    focus(){activeElement=this;}
    setAttribute(){}
    addEventListener(){}
    contains(element:Element){return element===this||element.closest('#screen,#mandate-nav')===this;}
  }
  class Button extends Element{}class Input extends Element{}class TextArea extends Element{}
  class Details extends Element{summary:Element;constructor(){super();this.tagName='DETAILS';this.summary=new Element();this.summary.tagName='SUMMARY';this.summary.parent=this;}}
  const nodes=new Map<string,Element>();const node=(selector:string)=>{const id=selector.replace(/^#/,'');if(!nodes.has(selector))nodes.set(selector,new Element(id));return nodes.get(selector)!;};
  const originalContent={kind:'plan',title:'合成方案',summary:'只验证版本化阅读',evidence:[],assumptions:[],unknowns:['效果未知'],applicability:'合成工程',invalidatedBy:[],recommendation:'观察后补证',alternatives:[{option:'保持现状',costs:'待估',risks:'待估'}],constraints:[],observation:{baseline:'未知',expectedChange:'未知',measure:'未知',window:'复查窗口',source:'来源一',check:'核对新证据'}};
  const revisions=[1,2].map(version=>({artifactId:'artifact-one',version,kind:'plan',content:{...originalContent,title:`合成方案 v${version}`},reason:'合成修订',createdAt:`2026-11-17T01:0${version}:00Z`,goalRevision:1,qualification:'current'}));
  const followups=[{id:'followup-one',artifact:{artifactId:'artifact-one',version:1},reason:'保留已检查的合成安排',dependencies:[],trigger:{kind:'at',at:'2026-11-18T00:00:00Z'},status:'observed',schedule:{status:'stopped'},observation:{summary:'本次检查仍未知',at:'2026-11-17T01:03:00Z'}}];
  const location={hash:'#delegation/delegation-one/plan'};
  const document={querySelector:node,getElementById:(id:string)=>node('#screen').decisions.find(value=>value.id===id)??node('#'+id),get activeElement(){return activeElement;},body:new Element('body'),documentElement:{dataset:{}},addEventListener:(name:string,callback:(event:{target:Element;preventDefault():void})=>unknown)=>events.set(name,callback),hidden:false};
  const context={document,window:{addEventListener:(name:string,callback:()=>unknown)=>listeners.set(name,callback),scrollTo(){},scrollBy(){}},location,history:{replaceState(_state:unknown,_title:string,hash:string){location.hash=hash;}},localStorage:{getItem(){return null;},setItem(){}},HTMLElement:Element,HTMLButtonElement:Button,HTMLInputElement:Input,HTMLTextAreaElement:TextArea,AbortSignal,Intl,Date,Map,JSON,Array,Object,String,Number,Set,encodeURIComponent,decodeURIComponent,setTimeout(callback:()=>unknown,delay:number){timers.push({callback,delay});return timers.length;},clearTimeout(){},fetch:async(path:string)=>{requests++;if(path.startsWith('/api/delegations/')&&detailGate){const waiting=detailGate;detailGate=null;await waiting;}const delegation={id:path.startsWith('/api/delegations/')?decodeURIComponent(path.split('/').at(-1)!):'delegation-one',goal:'持续合成目标',boundary:'只研究',goalRevision:1,version:1,lifecycle:'active',updatedAt:'2026-11-17T01:00:00Z',revisions:[],activity:[],research:{status:'following'}};const runtime={status:'configured',message:'合成投影'};return{ok:true,json:async()=>path==='/api/delegations'?{delegations:[{...delegation,pendingDecisions:decisionData.decisions??[]}],runtime}:{delegation,runtime,history:[],messages:[],research:[],artifacts:[],artifactRevisions:revisions,followups,sources:[],technical:[],deliveries:[],...decisionData}};}};
  vm.runInNewContext(readFileSync(new URL('../src/web/app.js',import.meta.url),'utf8'),context);
  const drain=()=>new Promise<void>(resolve=>setImmediate(resolve));await drain();assert.ok(node('#screen').innerHTML.includes('合成方案 v2'));
  listeners.get('pageshow')!();await drain();
  return{screen:node('#screen'),document,requests:()=>requests,revisions,flush:drain,holdNextDetail(){let release!:()=>void;detailGate=new Promise<void>(resolve=>{release=resolve;});return release;},async overview(){location.hash='#overview';listeners.get('hashchange')!();await drain();},async clickPending(id:string,revision:number){const button=new Button();button.dataset={action:'reminder-open',id:'delegation-one',decision:id,decisionRevision:String(revision)};button.parent=node('#screen');node('#screen').transients.push(button);button.focus();events.get('click')!({target:button,preventDefault(){}});await drain();},clickArtifact(artifactId:string,version:number){const button=new Button();button.dataset={action:'artifact-open',artifact:artifactId,planVersion:String(version)};button.parent=node('#screen');events.get('click')!({target:button,preventDefault(){}});},async tick(){const timer=timers.at(-1);assert.equal(timer?.delay,5000);timer!.callback();await drain();},async navigate(id:string,tab='plan'){location.hash=`#delegation/${id}/${tab}`;listeners.get('hashchange')!();await drain();}};
}

const outcomeChoice={id:'outcome-choice-one',decisionId:'outcome-decision-one',revision:1,artifact:{artifactId:'artifact-one',version:1},scope:'仅选择范围 A',action:'partial',createdAt:'2026-11-17T01:00:00Z',qualification:'current'};
const executionFixture={kind:'execution',id:'execution-one',revision:1,artifact:{artifactId:'artifact-one',version:1},choiceId:outcomeChoice.id,choice:outcomeChoice,scope:'实际只执行范围 A 的一部分',status:'partial',asOf:'2026-11-17T02:00:00Z',startedAt:'2026-11-17T01:10:00Z',extent:'合成对象中仅一部分已开始',evidence:[{ref:'source-execution-exact',hash:'a'.repeat(64)}],statementIds:['operator-statement-one'],statements:[{kind:'operator_statement',messageId:'operator-statement-one',text:'目前只落实了原选择范围中的一小部分。',createdAt:'2026-11-17T01:50:00Z'}],unknowns:['执行程度来自陈述，仍需独立核实'],reason:'取得新的有限反馈',createdAt:'2026-11-17T02:01:00Z',goalRevision:1,epoch:0,qualification:'current',latest:true};
const observationFixture={kind:'observation',id:'observation-one',revision:1,artifact:{artifactId:'artifact-one',version:1},choiceId:outcomeChoice.id,choice:outcomeChoice,execution:{id:'execution-one',revision:1},scope:'仅观察实际已执行的子范围',period:{from:'2026-11-17T01:10:00Z',to:'2026-11-17T02:00:00Z'},observedAt:'2026-11-17T02:00:00Z',maturity:'immature',baseline:'原始基线未变',measure:'原评价口径',result:'观察有改善线索，尚不能归因',comparability:'观察期尚短',gaps:['后续期间尚未成熟'],evidence:[{ref:'source-observation-exact',hash:'b'.repeat(64)}],statementIds:[],unknowns:['归因未知'],reason:'保留有限观察，不推断方案有效',createdAt:'2026-11-17T02:01:00Z',goalRevision:1,epoch:0,qualification:'current',latest:true};
const effectFixture={artifactId:'effect-one',version:1,kind:'judgment',goalRevision:1,epoch:0,createdAt:'2026-11-17T02:02:00Z',qualification:'current',reason:'保留有限归因，不由改善推定有效',content:{kind:'judgment',title:'有限范围的效果判断',summary:'目前尚不能证明方案带来改善',evidence:[{ref:'effect-source-exact',hash:'c'.repeat(64)}],assumptions:[],unknowns:['尚缺完整观察期间'],applicability:'已执行的子范围',invalidatedBy:[],effect:{plan:outcomeChoice.artifact,choiceId:outcomeChoice.id,execution:{id:'execution-one',revision:1},observation:{id:'observation-one',revision:1},scope:'仅评价原执行的有限子范围',evidenceConnection:'观察与执行同时存在，尚缺足够反事实依据',competingExplanations:['同期需求变化也可能造成改善'],limitations:['观察窗口过短，样本覆盖有限']}}};

test('effect judgments stay in the exact choice and chosen plan attribution cell with their finite claim and disclosed basis',async()=>{
 const second={...outcomeChoice,id:'outcome-choice-two',artifact:{artifactId:'artifact-one',version:2},scope:'独立范围 B'};
 const ui=await workspace({outcomeFeed:{choices:[outcomeChoice,second],executions:[executionFixture],observations:[observationFixture]},effectAssessments:[effectFixture]});await ui.navigate('delegation-one','results');const html=ui.screen.innerHTML;
 const [first,other]=html.split('data-outcome-choice="outcome-choice-one"')[1].split('data-outcome-choice="outcome-choice-two"');
 for(const text of ['目前尚不能证明方案带来改善','仅评价原执行的有限子范围','执行 execution-one @ r1','观察 observation-one @ r1','effect-source-exact','同期需求变化也可能造成改善','观察窗口过短，样本覆盖有限','尚缺完整观察期间','观察与执行同时存在'])assert.ok(first.includes(text),text);
 assert.equal(other.includes('目前尚不能证明方案带来改善'),false);assert.ok(other.includes('尚无归因判断'));assert.ok(first.includes('准确方案 artifact-one @ v1'));assert.equal(html.includes('<form'),false);assert.equal(html.includes('data-action="decision-'),false);
 const detail=ui.screen.querySelectorAll('details').find(value=>value.dataset.disclosure==='effect:effect-one:1')!;assert.ok(detail);assert.equal(detail.open,false);detail.open=true;detail.summary.focus();await ui.tick();assert.equal(ui.screen.querySelectorAll('details').find(value=>value.dataset.disclosure===detail.dataset.disclosure)?.open,true);assert.equal(ui.document.activeElement?.tagName,'SUMMARY');
 await ui.navigate('delegation-one','plan');assert.equal(ui.screen.innerHTML.includes('目前尚不能证明方案带来改善'),false);
});

test('a focused effect basis follows its exact revision into history and keeps its own disclosure state through polling',async()=>{
 for(const historyOpen of [false,true])for(const ownOpen of [false,true]){
  const effects=[effectFixture,{...effectFixture,version:2,content:{...effectFixture.content,summary:'第二版有限效果判断'}}];const ui=await workspace({effectAssessments:effects,outcomeFeed:{choices:[outcomeChoice],executions:[executionFixture],observations:[observationFixture]}});await ui.navigate('delegation-one','results');
  const history=ui.screen.querySelectorAll('details').find(value=>value.dataset.disclosure==='effect-history:outcome-choice-one:artifact-one:1')!;assert.ok(history);history.open=historyOpen;
  const key='effect:effect-one:2',basis=ui.screen.querySelectorAll('details').find(value=>value.dataset.disclosure===key)!;basis.open=ownOpen;basis.summary.focus();await ui.tick();assert.equal(ui.screen.querySelectorAll('details').find(value=>value.dataset.disclosure===key)?.summary.scrolled,false);
  effects.push({...effectFixture,version:3,content:{...effectFixture.content,summary:'第三版仍保留限制'}});await ui.tick();const moved=ui.screen.querySelectorAll('details').find(value=>value.dataset.disclosure===key)!;
  assert.equal(ui.document.activeElement,moved.summary);assert.equal(moved.open,ownOpen);assert.equal(moved.parentElement?.closest('details')?.open,true);assert.equal(moved.summary.scrolled,true,'The exact effect basis moves into history visibly');
  await ui.tick();assert.equal(ui.screen.querySelectorAll('details').find(value=>value.dataset.disclosure===key)?.summary.scrolled,false);assert.ok(ui.screen.innerHTML.includes('第三版仍保留限制'));
 }
});

test('unqualified effect bodies never replay from retained payload and an unavailable newer revision does not promote its predecessor',async()=>{
 const stale={...effectFixture,content:{...effectFixture.content,title:'UNQUALIFIED_EFFECT_TITLE',summary:'UNQUALIFIED_EFFECT_BODY',evidence:[{ref:'UNQUALIFIED_EFFECT_REF',hash:'c'.repeat(64)}],unknowns:['UNQUALIFIED_EFFECT_UNKNOWN'],effect:{...effectFixture.content.effect,scope:'UNQUALIFIED_EFFECT_SCOPE',competingExplanations:['UNQUALIFIED_EFFECT_EXPLANATION'],limitations:['UNQUALIFIED_EFFECT_LIMIT']}}};
 const effects=[stale];const ui=await workspace({effectAssessments:effects,outcomeFeed:{choices:[outcomeChoice],executions:[executionFixture],observations:[observationFixture]}});await ui.navigate('delegation-one','results');assert.ok(ui.screen.innerHTML.includes('UNQUALIFIED_EFFECT_BODY'));
 stale.qualification='unavailable';await ui.tick();assert.equal(ui.screen.innerHTML.includes('UNQUALIFIED_EFFECT_'),false);assert.ok(ui.screen.innerHTML.includes('资格已变化的效果判断（1）'));assert.ok(ui.screen.innerHTML.includes('effect-one @ v1'));assert.ok(ui.screen.innerHTML.includes('尚无归因判断'));
 effects.splice(0,1,effectFixture,{...stale,version:2});await ui.tick();const html=ui.screen.innerHTML;assert.equal(html.includes('UNQUALIFIED_EFFECT_'),false);assert.ok(html.includes('尚无归因判断'));assert.ok(html.includes('历史效果判断（1）'));assert.ok(html.indexOf('data-disclosure="effect-history:')<html.indexOf('目前尚不能证明方案带来改善'),'The qualified predecessor is historical rather than the current effect');
});

test('results preserve exact chosen plan and independent scopes while execution and immature observation remain separate from attribution',async()=>{
 const otherChoice={...outcomeChoice,id:'outcome-choice-two',decisionId:'outcome-decision-two',artifact:{artifactId:'artifact-one',version:2},scope:'仅选择范围 B',action:'adopt'};
 const ui=await workspace({outcomeFeed:{choices:[outcomeChoice,otherChoice],executions:[executionFixture],observations:[observationFixture]}});await ui.navigate('delegation-one','results');const html=ui.screen.innerHTML;
 assert.ok(html.includes('data-outcome-choice="outcome-choice-one"'));assert.ok(html.includes('data-outcome-choice="outcome-choice-two"'));
 assert.ok(html.includes('实际只执行范围 A 的一部分'));assert.ok(html.includes('部分执行'));assert.ok(html.includes('观察未成熟'));assert.ok(html.includes('观察有改善线索，尚不能归因'));assert.ok(html.includes('仅选择范围 B'));
 assert.match(html,/data-action="artifact-open"[^>]*data-artifact="artifact-one"[^>]*data-plan-version="1"/);
 assert.ok(html.includes('source-execution-exact'));assert.ok(html.includes('operator-statement-one'));assert.ok(html.includes('负责人原始陈述'));assert.ok(html.includes('未经系统独立核实'));
 assert.ok(html.includes('目前只落实了原选择范围中的一小部分。'));
 assert.ok(html.includes('尚无归因判断'));assert.ok(html.includes('尚无可复用经验'));assert.equal(html.includes('data-action="decision-adopt"'),false);assert.equal(html.includes('<form'),false);
 const before=ui.requests();await ui.tick();assert.ok(ui.requests()>=before+2);assert.ok(ui.screen.innerHTML.includes('实际只执行范围 A 的一部分'));
});

test('results show evidence-driven cognition corrections and pending plan re-evaluations without replaying withdrawn bodies',async()=>{
  const cognition:any={supportRelations:[{id:'support-one',revision:1,status:'active',judgment:{artifactId:'judgment-one',version:1},plan:{artifactId:'plan-one',version:1},scope:'仅限声明范围',why:'J1 is the key mechanism precondition',goalRevision:1,epoch:1}],reviews:[{id:'review-one',judgment:{artifactId:'judgment-one',version:1},resultJudgment:{artifactId:'judgment-one',version:2},trigger:{kind:'source_event',eventId:'event-one',sourceId:'source-one',observedAt:'2026-11-17T01:00:00.000Z'},conclusion:'revised',summary:'反证改变了机制认识',changes:['适用范围收窄'],limitations:['不能归因经营改善'],unknowns:['P2 条件未知'],nextReview:{condition:'待P1与P2重评后复查'},goalRevision:1,epoch:1}],reevaluations:[{id:'task-one',reviewId:'review-one',relation:{id:'support-one',revision:1},judgment:{artifactId:'judgment-one',version:1},plan:{artifactId:'plan-one',version:1},status:'pending',binding:{goalRevision:1,epoch:1}},{id:'task-two',reviewId:'review-one',relation:{id:'support-two',revision:1},judgment:{artifactId:'judgment-one',version:1},plan:{artifactId:'plan-two',version:1},status:'completed',result:{conclusion:'limit',reason:'建议适用性需要收窄',nextSteps:['发布新版建议'],unknowns:['新条件未知']},binding:{goalRevision:1,epoch:1}}],pendingReevaluations:[]};
  const ui=await workspace({cognition});await ui.navigate('delegation-one','results');const html=ui.screen.innerHTML;
  assert.ok(html.includes('反证与建议重评'));assert.ok(html.includes('反证改变了机制认识'));assert.ok(html.includes('待重评建议（1）'));assert.ok(html.includes('plan-one @ v1'));assert.ok(html.includes('建议适用性需要收窄'));assert.ok(html.includes('待P1与P2重评后复查'));assert.ok(html.includes('J1 is the key mechanism precondition'));
  assert.equal(html.includes('<form'),false);assert.equal(html.includes('data-action="decision-adopt"'),false);
  cognition.reviews[0]={...cognition.reviews[0],summary:'WITHDRAWN_COGNITION_BODY',qualification:'unavailable'};cognition.supportRelations[0]={...cognition.supportRelations[0],why:'WITHDRAWN_SUPPORT_BODY',qualification:'unavailable'};
  await ui.tick();const protectedHtml=ui.screen.innerHTML;assert.equal(protectedHtml.includes('WITHDRAWN_COGNITION_'),false);assert.equal(protectedHtml.includes('WITHDRAWN_SUPPORT_'),false);assert.ok(protectedHtml.includes('资格已变化的认识记录（2）'));
});

test('results show conditional reusable experiences and actual use without replaying withdrawn bodies',async()=>{
  const experiences:any=[{id:'experience-one',version:2,title:'条件化会员经验',status:'limited',qualification:'current',summary:'仅在复购会员子集适用',sourceDelegationId:'delegation-one',createdAt:'2026-11-18T01:00:00.000Z',validUntil:'2099-01-01T00:00:00.000Z',businessConditions:['复购会员子集'],limitations:['不证明因果'],counterexamples:[{ref:'synthetic-counterexample',hash:'a'.repeat(64)}],unknowns:['长期稳定性未知'],revalidateWhen:{condition:'新反证到达时'}},{id:'experience-two',version:1,title:'资格变化经验',status:'active',qualification:'unavailable',sourceDelegationId:'delegation-one',createdAt:'2026-11-18T01:00:00.000Z',validUntil:'2099-01-01T00:00:00.000Z'}];
  const uses:any=[{id:'use-one',experience:{id:'experience-one',version:2},decision:'applied',reason:'目标范围与条件一致',influence:'优先核对会员复购机制',artifact:{artifactId:'artifact-one',version:1},createdAt:'2026-11-18T01:10:00.000Z'},{id:'use-two',experience:{id:'experience-one',version:2},decision:'not_applied',reason:'新客范围不匹配',influence:'避免泛化复用',createdAt:'2026-11-18T01:11:00.000Z'}];
  const ui=await workspace({experiences:{experiences,uses}});await ui.navigate('delegation-one','results');const html=ui.screen.innerHTML;
  assert.ok(html.includes('可复用经验'));assert.ok(html.includes('仅在复购会员子集适用'));assert.ok(html.includes('复购会员子集'));assert.ok(html.includes('优先核对会员复购机制'));assert.ok(html.includes('避免泛化复用'));assert.ok(html.includes('经验使用不是独立证据'));assert.equal(html.includes('UNAVAILABLE_EXPERIENCE'),false);assert.equal(html.includes('<form'),false);
  experiences[0]={...experiences[0],qualification:'unavailable',summary:'WITHDRAWN_EXPERIENCE_BODY',businessConditions:['WITHDRAWN_EXPERIENCE_CONDITION']};uses[0]={...uses[0],qualification:'unavailable'};
  await ui.tick();const protectedHtml=ui.screen.innerHTML;assert.equal(protectedHtml.includes('WITHDRAWN_EXPERIENCE_'),false);assert.equal(protectedHtml.includes('仅在复购会员子集适用'),false);assert.equal(protectedHtml.includes('优先核对会员复购机制'),false);assert.ok(protectedHtml.includes('过期或资格变化的经验（2）'));assert.ok(protectedHtml.includes('当前没有可回放正文的适用经验'));
});

test('an observation stays linked to its exact older execution revision while disclosed history survives refresh and version updates',async()=>{
 const feed={choices:[outcomeChoice],executions:[{...executionFixture,latest:false},{...executionFixture,revision:2,extent:'执行范围后来扩大，但旧观察不转移',latest:true}],observations:[observationFixture]};const ui=await workspace({outcomeFeed:feed});await ui.navigate('delegation-one','results');
 assert.ok(ui.screen.innerHTML.includes('对应执行 execution-one @ r1'));assert.ok(ui.screen.innerHTML.includes('执行范围后来扩大，但旧观察不转移'));
 const history=ui.screen.querySelectorAll('details').find(detail=>detail.summary.textContent==='历史执行与观察修订（1）')!;assert.ok(history);assert.equal(history.open,false);history.open=true;
 const basis=ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure==='outcome:execution:execution-one:1')!;basis.open=true;basis.summary.focus();await ui.tick();
 const restored=ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===basis.dataset.disclosure)!;assert.equal(restored.open,true);assert.equal(ui.document.activeElement,restored.summary);assert.equal(restored.parentElement?.closest('details')?.open,true);
 feed.executions.push({...executionFixture,revision:3,extent:'第三版准确执行反馈',latest:true});feed.executions[1].latest=false;await ui.tick();assert.ok(ui.screen.innerHTML.includes('对应执行 execution-one @ r1'));assert.ok(ui.screen.innerHTML.includes('第三版准确执行反馈'));assert.equal(ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===basis.dataset.disclosure)?.open,true);
});

test('a focused execution disclosure stays visible when a new revision moves it into closed or already-open result history',async()=>{
 for(const historyOpen of [false,true]){
  const feed={choices:[outcomeChoice],executions:[{...executionFixture,latest:false},{...executionFixture,revision:2,latest:true}],observations:[observationFixture]};const ui=await workspace({outcomeFeed:feed});await ui.navigate('delegation-one','results');
  const history=ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure?.startsWith('outcome-history:'))!;history.open=historyOpen;
  const key='outcome:execution:execution-one:2',basis=ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===key)!;basis.open=false;basis.summary.focus();await ui.tick();assert.equal(ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===key)?.summary.scrolled,false);
  feed.executions[1].latest=false;feed.executions.push({...executionFixture,revision:3,latest:true});await ui.tick();const moved=ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===key)!;
  assert.equal(ui.document.activeElement,moved.summary);assert.equal(moved.open,false,'The user-closed source detail remains closed');assert.equal(moved.parentElement?.closest('details')?.open,true);assert.equal(moved.summary.scrolled,true,'A new current-to-history location must remain visibly readable even when history was already open');
  await ui.tick();assert.equal(ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===key)?.summary.scrolled,false,'An unchanged historical result does not repeatedly scroll');
 }
});

test('revoked outcome bodies and choice scope stay hidden even when old payload fields remain beside safe metadata',async()=>{
 const feed={choices:[{...outcomeChoice,scope:'UNQUALIFIED_CHOICE_SCOPE'}],executions:[{...executionFixture,extent:'UNQUALIFIED_EXECUTION_BODY',scope:'UNQUALIFIED_EXECUTION_SCOPE',evidence:[{ref:'UNQUALIFIED_SOURCE_REF',hash:'a'.repeat(64)}],statements:[{kind:'operator_statement',messageId:'operator-statement-one',text:'UNQUALIFIED_STATEMENT',createdAt:'2026-11-17T01:50:00Z'}]}],observations:[{...observationFixture,result:'UNQUALIFIED_OBSERVATION_BODY'}]};const ui=await workspace({outcomeFeed:feed});await ui.navigate('delegation-one','results');assert.ok(ui.screen.innerHTML.includes('UNQUALIFIED_EXECUTION_BODY'));
 for(const entry of [...feed.choices,...feed.executions,...feed.observations])entry.qualification='unavailable';await ui.tick();const html=ui.screen.innerHTML;
 assert.equal(html.includes('UNQUALIFIED_'),false);assert.ok(html.includes('资格已变化的结果记录（2）'));assert.ok(html.includes('execution-one @ r1'));assert.ok(html.includes('方案 artifact-one @ v1'));assert.equal(html.includes('data-action="artifact-open"'),false);assert.ok(html.includes('旧范围、正文和来源不在当前投影回放'));
});

test('not-started and unknown execution plus missing-data observations remain explicit without inventing success or another source',async()=>{
 const feed={choices:[{...outcomeChoice,scope:'<img src=x onerror=alert(1)>'}],executions:[{...executionFixture,id:'execution-not-started',status:'not_started',extent:'负责人说明尚未开始'}, {...executionFixture,id:'execution-unknown',status:'unknown',extent:'尚未取得执行反馈',evidence:[],statementIds:[],statements:[],unknowns:['执行事实仍有缺口']}],observations:[{...observationFixture,id:'observation-missing',maturity:'missing_data',result:'本期记录未到齐，暂不判断变化',baseline:'基线仍待核对',measure:'原口径',comparability:'资料不足',gaps:['缺少本期资料'],evidence:[],unknowns:['观察未完成']}]};const ui=await workspace({outcomeFeed:feed});await ui.navigate('delegation-one','results');const html=ui.screen.innerHTML;
 assert.ok(html.includes('未执行'));assert.ok(html.includes('执行情况未知'));assert.ok(html.includes('观察缺资料'));assert.ok(html.includes('本期记录未到齐，暂不判断变化'));assert.ok(html.includes('缺少本期资料'));assert.ok(html.includes('尚无可核对来源'));assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.equal(html.includes('<img src=x'),false);assert.equal(html.includes('方案已奏效'),false);assert.equal(html.includes('data-action="decision-'),false);
});

const notificationFixture={
 matters:[
  {id:'matter-one',revision:1,kind:'inform',artifact:{artifactId:'artifact-one',version:1},title:'UNQUALIFIED_OLD_MATTER',summary:'UNQUALIFIED_OLD_BODY',changes:[],unknowns:[],mergeReason:'Old version',urgency:'brief',createdAt:'2026-11-17T01:01:00Z',qualification:'historical'},
  {id:'matter-one',revision:2,kind:'inform',artifact:{artifactId:'artifact-one',version:2},title:'合并后的持续事项',summary:'同一问题的新证据与变化',changes:['新增反证，判断范围收窄'],unknowns:['效果仍未知'],mergeReason:'同一持续事项的两个来源',urgency:'immediate',immediateReason:'等到下次简报会失去关注时间',createdAt:'2026-11-17T01:02:00Z',qualification:'current'},
  {id:'matter-two',revision:1,kind:'decision',artifact:{artifactId:'artifact-one',version:2},decision:{id:'decision-one',revision:2},title:'独立经营选择',summary:'需要明确选择范围',changes:['窗口临近'],unknowns:['执行尚未发生'],mergeReason:'独立选择保留',urgency:'brief',createdAt:'2026-11-17T01:02:00Z',qualification:'current'}
 ],
 briefs:[{id:'brief-one',windowKey:'2026-11-17',summary:'工作日的有限研究汇总',createdAt:'2026-11-17T01:03:00Z',status:'published',matters:[{id:'matter-one',revision:2},{id:'matter-two',revision:1}]}],
 notices:[{id:'notice-one',kind:'immediate',createdAt:'2026-11-17T01:02:00Z',matters:[{id:'matter-one',revision:2}]},{id:'notice-two',kind:'brief',createdAt:'2026-11-17T01:03:00Z',matters:[{id:'matter-one',revision:2},{id:'matter-two',revision:1}]},{id:'notice-three',kind:'reminder',reason:'当前决策窗口需要复查',createdAt:'2026-11-17T01:03:00Z',matters:[{id:'matter-two',revision:1}]}]
};

test('station summaries render one current block per stable matter and retain independent exact decision references',async()=>{
 const ui=await workspace({notificationFeed:structuredClone(notificationFixture)});await ui.navigate('delegation-one','progress');const html=ui.screen.innerHTML;
 assert.ok(html.includes('工作日简报'));assert.ok(html.includes('工作日的有限研究汇总'));
 assert.equal(html.split('合并后的持续事项').length-1,1);assert.ok(html.includes('新增反证，判断范围收窄'));assert.ok(html.includes('决策窗口跟进'));
 assert.equal(html.includes('UNQUALIFIED_OLD_MATTER'),false);assert.equal(html.includes('UNQUALIFIED_OLD_BODY'),false);
 assert.match(html,/data-action="artifact-open"[^>]*data-artifact="artifact-one"[^>]*data-plan-version="2"/);
 assert.match(html,/data-action="decision-open"[^>]*data-decision="decision-one"[^>]*data-decision-revision="2"/);
 assert.ok(html.includes('站内展示不表示经营者已读或采纳'));
});

test('a checked workday without material changes shows status without inventing an empty pushed brief',async()=>{
 const ui=await workspace({notificationFeed:{matters:[],notices:[],briefs:[{id:'empty-check',windowKey:'2026-11-17',status:'no_change',summary:'DO_NOT_PUSH_EMPTY_BODY',createdAt:'2026-11-17T01:03:00Z',matters:[]}]}});await ui.navigate('delegation-one','progress');
 assert.ok(ui.screen.innerHTML.includes('工作日核对已记录，暂无实质变化'));assert.equal(ui.screen.innerHTML.includes('DO_NOT_PUSH_EMPTY_BODY'),false);assert.equal(ui.screen.innerHTML.includes('已发送空简报'),false);
});

test('withdrawn notification and brief bodies cannot reappear through old station snapshots',async()=>{
 const payload={notificationFeed:structuredClone(notificationFixture)};const ui=await workspace(payload);await ui.navigate('delegation-one','progress');assert.ok(ui.screen.innerHTML.includes('同一问题的新证据与变化'));
 payload.notificationFeed={...payload.notificationFeed,matters:payload.notificationFeed.matters.map(item=>({...item,qualification:'historical'})),briefs:payload.notificationFeed.briefs.map(item=>({...item,qualification:'historical'}))};await ui.tick();
 assert.equal(ui.screen.innerHTML.includes('同一问题的新证据与变化'),false);assert.equal(ui.screen.innerHTML.includes('工作日的有限研究汇总'),false);assert.equal(ui.screen.innerHTML.includes('当前决策窗口需要复查'),false);assert.ok(ui.screen.innerHTML.includes('资料资格已变化'));
});

test('expanded version and evidence disclosures survive the normal five-second HTTP projection refresh',async()=>{
  const ui=await workspace();const before=ui.requests();const details=ui.screen.querySelectorAll('details');assert.ok(details.some(detail=>detail.summary.textContent.startsWith('历史判断与方案')));assert.ok(details.some(detail=>detail.summary.textContent==='备选、约束与观察安排'));
  for(const detail of details)detail.open=true;
  await ui.tick();assert.ok(ui.requests()>=before+2,'The normal HTTP list and detail were refreshed');
  const restored=ui.screen.querySelectorAll('details');assert.equal(restored.length,details.length);assert.ok(restored.every(detail=>detail.open),'User-expanded plan history and evidence stay open across projection refresh');
});
test('closed disclosures stay closed and new versions do not inherit the old version reading state',async()=>{
  const ui=await workspace();const oldEvidence=ui.screen.querySelectorAll('details').find(detail=>detail.summary.textContent==='依据、假设与适用条件')!;const oldKey=oldEvidence.dataset.disclosure;assert.ok(oldKey);oldEvidence.open=true;await ui.tick();const restored=ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===oldKey)!;assert.equal(restored.open,true);restored.open=false;await ui.tick();assert.equal(ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===oldKey)?.open,false);
  ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===oldKey)!.open=true;const last=ui.revisions.at(-1)!;ui.revisions.push({...last,version:3,createdAt:'2026-11-17T01:03:00Z',content:{...last.content,title:'合成方案 v3'}});await ui.tick();const evidence=ui.screen.querySelectorAll('details').filter(detail=>detail.summary.textContent==='依据、假设与适用条件');assert.notEqual(evidence[0].dataset.disclosure,oldKey);assert.equal(evidence[0].open,false,'New version starts without inheriting v2 openness');assert.equal(evidence.find(detail=>detail.dataset.disclosure===oldKey)?.open,true,'v2 retains its own reading state');
});
test('reading state is scoped to the current delegation and tab and retains the focused summary',async()=>{
  const ui=await workspace();const evidence=ui.screen.querySelectorAll('details').find(detail=>detail.summary.textContent==='依据、假设与适用条件')!;evidence.open=true;evidence.summary.focus();const key=evidence.dataset.disclosure;await ui.tick();const same=ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure===key)!;assert.equal(ui.document.activeElement,same.summary);
  await ui.navigate('delegation-two');assert.ok(ui.screen.querySelectorAll('details').every(detail=>!detail.open),'Another delegation does not inherit this reading state');await ui.navigate('delegation-two','progress');const history=ui.screen.querySelectorAll('details').find(detail=>detail.summary.textContent.startsWith('历史跟进记录'))!;assert.ok(history);history.open=true;await ui.tick();assert.equal(ui.screen.querySelectorAll('details').find(detail=>detail.summary.textContent.startsWith('历史跟进记录'))?.open,true);await ui.navigate('delegation-two','plan');assert.ok(ui.screen.querySelectorAll('details').every(detail=>!detail.open),'A newly entered tab does not receive another tab disclosure state');
});

const decisionFixture={id:'decision-one',revision:1,artifact:{artifactId:'artifact-one',version:2},title:'是否采纳合成方案的有限范围',question:'是否只调整示例范围 A？',options:[{id:'bounded',label:'只调整范围 A',scope:'范围 A，保留其他部分',costs:'需要核对说明',risks:'效果尚未证明'}],recommendation:{optionId:'bounded',reason:'先核对有限范围'},unknowns:['仍需反证'],nondecisionImpact:'相关取舍等待，独立研究继续',nextActions:['继续查找不依赖选择的证据'],window:{remindAt:'2099-01-02T00:00:00Z',decideBy:'2099-01-03T00:00:00Z',executeBy:'2099-01-04T00:00:00Z',basis:'合成时间依据，不代表现实期限',nextReviewAt:'2099-01-02T00:00:00Z'},status:'pending',qualification:'current'};

test('a viewed pending decision shows its exact proposal, choice scope and separate windows without inventing adoption',async()=>{
  const ui=await workspace({decisions:[decisionFixture],decisionResponses:[{id:'response-one',decisionId:'decision-one',revision:1,action:'acknowledge',text:'知悉此事项',createdAt:'2026-11-17T02:00:00Z'}],operatorChoices:[]});await ui.navigate('delegation-one','decisions');
  const html=ui.screen.innerHTML;assert.ok(html.includes('已知悉 · 仍待决'));assert.ok(html.includes('方案 v2'));assert.ok(html.includes('范围 A，保留其他部分'));assert.ok(html.includes('需要核对说明'));assert.ok(html.includes('提醒时间'));assert.ok(html.includes('最迟有效决定时间'));assert.ok(html.includes('执行期限'));assert.ok(html.includes('合成时间依据，不代表现实期限'));assert.ok(html.includes('尚无明确经营选择'));assert.ok(html.includes('data-action="decision-adopt"'));assert.ok(html.includes('继续查找不依赖选择的证据'));
});

test('historical decision revisions retain exact history and unknown deadlines without active choice controls or unsafe markup',async()=>{
  const historical={...decisionFixture,status:'superseded',qualification:'historical',closureReason:'plan_superseded',question:'<img src=x onerror=alert(1)>',window:{basis:'没有可靠截止依据',nextReviewAt:'2099-01-02T00:00:00Z'}};
  const ui=await workspace({decisions:[historical],operatorChoices:[{id:'choice-one',decisionId:'decision-one',revision:1,artifact:{artifactId:'artifact-one',version:2},action:'partial',scope:'仅范围 A 的一部分',text:'明确部分采纳',createdAt:'2026-11-17T02:00:00Z'}]});await ui.navigate('delegation-one','decisions');
  const html=ui.screen.innerHTML;assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.equal(html.includes('<img src=x'),false);assert.ok(html.includes('暂无硬性截止'));assert.ok(html.includes('仅范围 A 的一部分'));assert.ok(html.includes('方案 v2'));assert.ok(html.includes('不等于实际执行'));assert.match(html,/data-action="decision-adopt"[^>]*disabled/);
  const history=ui.screen.querySelectorAll('details').find(detail=>detail.summary.textContent==='历史待决事项（1）');assert.ok(history);assert.equal(history.open,false);assert.ok(html.includes('关联方案已有新版本，原选择不自动转移。'));history.open=true;await ui.tick();assert.equal(ui.screen.querySelectorAll('details').find(detail=>detail.dataset.disclosure==='decision-history')?.open,true);
});


test('decision evidence links open and retain the exact historical or parallel artifact card',async()=>{
  const ui=await workspace({decisions:[{...decisionFixture,artifact:{artifactId:'artifact-one',version:1},qualification:'historical',status:'superseded'}]});await ui.navigate('delegation-one','decisions');
  assert.match(ui.screen.innerHTML,/data-action="artifact-open"[^>]*data-artifact="artifact-one"[^>]*data-plan-version="1"/);
  ui.clickArtifact('artifact-one',1);const historical=ui.screen.querySelectorAll('[data-artifact-id][data-artifact-version]').find(element=>element.dataset.artifactId==='artifact-one'&&element.dataset.artifactVersion==='1');assert.ok(historical);assert.equal(ui.document.activeElement,historical);assert.equal(historical.closest('details')?.open,true);assert.ok(historical.details.every(detail=>detail.open));assert.equal(historical.scrolled,true);
  await ui.tick();const restored=ui.screen.querySelectorAll('[data-artifact-id][data-artifact-version]').find(element=>element.dataset.artifactId==='artifact-one'&&element.dataset.artifactVersion==='1');assert.equal(ui.document.activeElement,restored);assert.equal(restored?.closest('details')?.open,true);
  const existing=ui.revisions[0];ui.revisions.push({...existing,artifactId:'parallel-plan',content:{...existing.content,title:'另一份并行方案 v1'}});await ui.tick();ui.clickArtifact('parallel-plan',1);assert.equal(ui.document.activeElement?.dataset.artifactId,'parallel-plan');assert.equal(ui.document.activeElement?.dataset.artifactVersion,'1');
});


test('a focused current artifact remains revealed when a new revision moves it into history on poll',async()=>{
 const ui=await workspace();ui.clickArtifact('artifact-one',2);const original=ui.document.activeElement;assert.equal(original?.dataset.artifactVersion,'2');assert.equal(original?.closest('details'),null);
 const last=ui.revisions.at(-1)!;ui.revisions.push({...last,version:3,createdAt:'2026-11-17T01:03:00Z',content:{...last.content,title:'合成方案 v3'}});await ui.tick();
 const exact=ui.screen.querySelectorAll('[data-artifact-id][data-artifact-version]').find(element=>element.dataset.artifactId==='artifact-one'&&element.dataset.artifactVersion==='2');assert.ok(exact);assert.equal(exact.closest('details')?.open,true,'The original exact card moved into history and must remain revealed');assert.equal(ui.document.activeElement,exact);assert.equal(exact.scrolled,true,'Reveal the newly historical title instead of keeping an offscreen focus');
});

test('a focused basis summary stays visible when its current artifact moves into history without opening its own closed disclosure',async()=>{
 for(const ownOpen of [false,true]){
  const ui=await workspace();const basis=ui.screen.querySelectorAll('details[data-disclosure]').find(detail=>detail.dataset.disclosure==='artifact:artifact-one:2:basis')!;assert.ok(basis);basis.open=ownOpen;basis.summary.focus();await ui.tick();let restored=ui.screen.querySelectorAll('details[data-disclosure]').find(detail=>detail.dataset.disclosure===basis.dataset.disclosure)!;assert.equal(restored.open,ownOpen,'Ordinary polling must preserve the user selected basis state');assert.equal(ui.document.activeElement,restored.summary);
  const last=ui.revisions.at(-1)!;ui.revisions.push({...last,version:3,createdAt:'2026-11-17T01:03:00Z',content:{...last.content,title:'合成方案 v3'}});await ui.tick();restored=ui.screen.querySelectorAll('details[data-disclosure]').find(detail=>detail.dataset.disclosure===basis.dataset.disclosure)!;
  assert.equal(restored.parentElement?.closest('details')?.open,true,'Reveal the outer history that now contains the focused summary');assert.equal(restored.open,ownOpen,'Revealing history must not open or close the focused basis itself');assert.equal(ui.document.activeElement,restored.summary);assert.equal(restored.summary.scrolled,true);
 }
});


for(const historyOpen of [false,true])for(const focusKind of ['card','summary'])for(const ownOpen of [false,true]){
 test(`a focused ${focusKind} migrates visibly with history ${historyOpen?'open':'closed'} and basis ${ownOpen?'open':'closed'} without ordinary poll scrolling`,async()=>{
  const ui=await workspace();ui.screen.querySelectorAll('details[data-disclosure]').find(detail=>detail.dataset.disclosure==='artifact-history')!.open=historyOpen;
  if(focusKind==='card')ui.clickArtifact('artifact-one',2);
  const basis=ui.screen.querySelectorAll('details[data-disclosure]').find(detail=>detail.dataset.disclosure==='artifact:artifact-one:2:basis')!;basis.open=ownOpen;if(focusKind==='summary')basis.summary.focus();await ui.tick();
  let exact=ui.screen.querySelectorAll('[data-artifact-id][data-artifact-version]').find(element=>element.dataset.artifactId==='artifact-one'&&element.dataset.artifactVersion==='2')!;let restoredBasis=exact.details.find(detail=>detail.dataset.disclosure===basis.dataset.disclosure)!;let target=focusKind==='card'?exact:restoredBasis.summary;assert.equal(ui.document.activeElement,target);assert.equal(target.scrolled,false,'An unchanged section must not cause ordinary poll scrolling');assert.equal(restoredBasis.open,ownOpen);
  const last=ui.revisions.at(-1)!;ui.revisions.push({...last,version:3,createdAt:'2026-11-17T01:03:00Z',content:{...last.content,title:'合成方案 v3'}});await ui.tick();
  exact=ui.screen.querySelectorAll('[data-artifact-id][data-artifact-version]').find(element=>element.dataset.artifactId==='artifact-one'&&element.dataset.artifactVersion==='2')!;restoredBasis=exact.details.find(detail=>detail.dataset.disclosure===basis.dataset.disclosure)!;target=focusKind==='card'?exact:restoredBasis.summary;assert.equal(ui.document.activeElement,target);assert.equal(exact.closest('details')?.open,true);assert.equal(restoredBasis.open,ownOpen);assert.equal(target.scrolled,true,'A current-to-history section migration must reveal the exact reading target even when history was already open');
  await ui.tick();exact=ui.screen.querySelectorAll('[data-artifact-id][data-artifact-version]').find(element=>element.dataset.artifactId==='artifact-one'&&element.dataset.artifactVersion==='2')!;restoredBasis=exact.details.find(detail=>detail.dataset.disclosure===basis.dataset.disclosure)!;target=focusKind==='card'?exact:restoredBasis.summary;assert.equal(ui.document.activeElement,target);assert.equal(restoredBasis.open,ownOpen);assert.equal(target.scrolled,false,'Subsequent unchanged historical polling must not repeatedly scroll');
 });
}


test('home entry for a second independent decision carries its exact reference and focuses it after detail read',async()=>{
 const first={...decisionFixture,id:'first-choice',revision:1,qualification:'current',status:'pending',title:'First independent choice'};
 const second={...decisionFixture,id:'second-choice',revision:1,qualification:'current',status:'pending',title:'Second independent choice'};
 const ui=await workspace({decisions:[first,second]});await ui.overview();
 assert.match(ui.screen.innerHTML,/data-action="reminder-open"[^>]*data-decision="second-choice"[^>]*data-decision-revision="1"/);
 await ui.clickPending(second.id,second.revision);assert.equal(ui.document.activeElement?.dataset.decisionId,second.id);assert.equal(ui.document.activeElement?.dataset.decisionRevision,'1');assert.equal(ui.document.activeElement?.scrolled,true);
 await ui.tick();assert.equal(ui.document.activeElement?.dataset.decisionId,second.id);
});


test('a stale home decision reference reports unavailability instead of focusing a newer or another decision',async()=>{
 const first={...decisionFixture,id:'first-choice',revision:1,qualification:'current',status:'pending',title:'First choice'};
 const second={...decisionFixture,id:'second-choice',revision:1,qualification:'historical',status:'superseded',title:'Second choice old revision'};
 const replacement={...second,revision:2,qualification:'current',status:'pending',title:'Second choice current revision'};
 const ui=await workspace({decisions:[first,second,replacement]});await ui.overview();await ui.clickPending(second.id,1);
 assert.ok(ui.screen.innerHTML.includes('对应待决事项的准确版本当前不可用'));assert.equal(ui.document.activeElement?.dataset.decisionId,undefined);assert.equal(ui.document.activeElement?.id,'main');
});


test('a home target clicked during another refresh waits for a fresh matching detail read',async()=>{
 const second={...decisionFixture,id:'second-choice',revision:1,qualification:'current',status:'pending',title:'Second independent choice'};
 const ui=await workspace({decisions:[second]});const release=ui.holdNextDetail();await ui.navigate('delegation-one','progress');const beforeClick=ui.requests();
 await ui.clickPending(second.id,1);assert.notEqual(ui.document.activeElement?.dataset.decisionId,second.id);release();await ui.flush();await ui.flush();
 assert.ok(ui.requests()>=beforeClick+2,'The pre-click request is followed by a new list/detail read for the selected target');assert.equal(ui.document.activeElement?.dataset.decisionId,second.id);
});

test('leaving a pending home target does not redirect focus after the old detail request completes',async()=>{
 const second={...decisionFixture,id:'second-choice',revision:1,qualification:'current',status:'pending',title:'Second independent choice'};
 const ui=await workspace({decisions:[second]});const release=ui.holdNextDetail();await ui.navigate('delegation-one','progress');await ui.clickPending(second.id,1);await ui.overview();release();await ui.flush();await ui.flush();
 assert.ok(ui.screen.innerHTML.includes('委托总览'));assert.equal(ui.screen.innerHTML.includes('decision-card'),false);assert.notEqual(ui.document.activeElement?.dataset.decisionId,second.id);
});
