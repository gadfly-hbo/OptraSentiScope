import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

async function boot(){
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'operator-decision-test',principalId:'operator'},opened=[],delivered=[];
 const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,async deliver(m){delivered.push(m);return {accepted:true,messageId:m.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(r){return {id:`schedule-${opened.length}`,status:'active',...r};},async disableSchedule(){},async listSchedules(){return [];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const c=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'synthetic',model:'not-a-real-provider'}}),d=store.create(owner,{goal:'持续研究合成条件，不做经营动作',idempotencyKey:'create'});await c.sync(d.id);
 const main=()=>opened.find(x=>x.binding.role==='main');
 const invoke=(run,name,args)=>{const tool=run.options.tools.find(t=>t.name===name);assert.ok(tool,`Agent must have ${name}`);return tool.execute(args,{signal:new AbortController().signal});};
 return {store,owner,c,d,opened,delivered,main,invoke,async close(){await c.close();store.close();}};
}
const plan={kind:'plan',title:'合成有限方案',summary:'等待经营者明确选择',evidence:[],assumptions:[],unknowns:['不代表经营效果'],applicability:'仅合成资料',invalidatedBy:['资料或目标变化'],recommendation:'仅采用范围A',alternatives:[{option:'维持现状',costs:'未知',risks:'继续等待'}],constraints:['没有经营执行授权'],observation:{baseline:'未知',expectedChange:'未知',measure:'未验证',window:'待获准资料',source:'无企业资料',check:'继续独立研究'}};
const ref=a=>({artifactId:a.artifactId,version:a.version});
async function proposed(f){const a=await f.invoke(f.main(),'publish_artifact',{expectedVersion:0,requestId:'plan',reason:'合成方案',content:plan});return f.invoke(f.main(),'propose_decision',{expectedRevision:0,requestId:'ask',artifact:ref(a),title:'是否仅采用范围A',question:'明确选择哪个范围？',options:[{id:'a',label:'范围A',scope:'仅A，不含B',costs:'未知',risks:'需继续核查'}],recommendation:{optionId:'a',reason:'合成依据有限'},unknowns:['实际效果未知'],nondecisionImpact:'仅依赖选择的部分等待',nextActions:['继续独立补证'],window:{basis:'无硬截止依据',nextReviewAt:new Date(Date.now()+60000).toISOString()},reason:'确需经营者取舍'});}

test('seen remains pending, a missing response never blocks independent research, and exact partial choice is available to the Agent',async()=>{
 const f=await boot();try{
  const item=await proposed(f);
  const ack=await f.c.respondDecision(f.d.id,{id:item.id,revision:item.revision,artifact:item.artifact,requestId:'ack',action:'acknowledge',text:'已知悉'});await f.c.sync(f.d.id);
  let context=await f.invoke(f.main(),'research_context',{});assert.equal(context.decisions[0].status,'pending');assert.equal(context.decisions[0].choices.length,0);assert.ok(context.decisions[0].seenAt);
  assert.notEqual(await f.main().options.beforeStep(f.main().binding,{turn:2,step:1,scheduledOnly:true}),false,'An unanswered business choice must not gate scheduled research');
  const independent=await f.invoke(f.main(),'publish_artifact',{expectedVersion:0,requestId:'independent',reason:'该判断不依赖经营者选择',content:{kind:'judgment',title:'独立反证',summary:'研究持续推进',evidence:[],assumptions:[],unknowns:['效果未知'],applicability:'独立研究',invalidatedBy:[]}});assert.equal(independent.version,1);
  const response=await f.c.respondDecision(f.d.id,{id:item.id,revision:1,artifact:item.artifact,requestId:'partial-reply',action:'reply',text:'仅采纳A中的第一项，B不采纳'});await f.c.sync(f.d.id);
  assert.equal(f.c.detail(f.d.id).operatorChoices.length,0);
  await f.invoke(f.main(),'interpret_operator_response',{responseId:response.responseId,requestId:'interpret-partial',action:'partial',optionId:'a',scope:'A中的第一项；不含B',reason:'经营者在此事项的原话明确限定范围'});
  context=await f.invoke(f.main(),'research_context',{});const choice=context.decisions[0].choices[0];assert.equal(choice.action,'partial');assert.equal(choice.scope,'A中的第一项；不含B');assert.deepEqual(choice.artifact,item.artifact);assert.equal(choice.source,'interpreted');assert.deepEqual(f.c.detail(f.d.id).outcomes??[],[]);
  await assert.rejects(f.invoke(f.main(),'interpret_operator_response',{responseId:ack.responseId,requestId:'forge-ack',action:'adopt',optionId:'a',scope:'仅A，不含B',reason:'不能把知悉变成采纳'}));
  assert.ok(f.delivered.some(m=>m.text.includes('SENTISCOPE_OPERATOR_RESPONSE')),'The official Engine assessment path wakes the main Agent with a durable response identity');
 }finally{await f.close();}
});
