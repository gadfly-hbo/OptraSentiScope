import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

async function boot(){
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'intake-enterprise',principalId:'operator'},opened=[];
 const directory=mkdtempSync(join(tmpdir(),'sentiscope-intake-')),sourceFile=join(directory,'fact.txt');writeFileSync(sourceFile,'synthetic authorized business fact');
 const native={async open(binding,options){const handle={binding,options,sessionId:options.sessionId,async deliver(message){return{accepted:true,messageId:message.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){return{id:`schedule-${Math.random()}`,...request};},async disableSchedule(){},async listSchedules(){return[];}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const coordinator=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'},notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5,6,7]}}),delegation=store.create(owner,{goal:'提升会员复购',idempotencyKey:'create'});await coordinator.sync(delegation.id);coordinator.configureSources(delegation.id,[{sourceId:'business-source',directory,grantRevision:1,enabled:true}]);await coordinator.sync(delegation.id);
 const run=()=>opened.findLast(entry=>entry.binding.delegationId===delegation.id);const invoke=(name,args)=>{const tool=run().options.tools.find(item=>item.name===name);assert.ok(tool,`Missing ${name}`);return tool.execute(args,{signal:new AbortController().signal});};
 return{store,owner,coordinator,delegation,directory,invoke,async close(){await coordinator.close();store.close();rmSync(directory,{recursive:true,force:true});}};
}

test('the main Agent builds a revisioned one-page intake summary and localizes key gaps',async()=>{
 const f=await boot();try{
  const source=(await f.invoke('research_context',{})).references.at(-1);assert.ok(source);
  const summary=await f.invoke('save_intake_summary',{requestId:'intake-v1',expectedRevision:0,reason:'Initial background completion from the one-sentence goal and authorized source',content:{objective:'提升老会员在下一季度的复购',facts:['授权资料说明当前会员复购基础'],assumptions:['目标先研究而非直接执行经营动作'],reusableExperiences:[],researchAuthorization:['当前仅允许读取business-source'],businessBoundary:['不执行经营动作，不访问未授权企业系统'],evaluation:['目标值未明确前只评估现状和可验证方向'],followUp:['继续获准范围内的现状研究'],unknowns:['目标值和期间尚未明确'],questions:[{id:'target-metric',question:'希望把复购提升到多少？',impact:'影响评价口径和目标达成判断',blockingScopes:['目标达成评价'],status:'pending'}]}});
  assert.equal(summary.revision,1);assert.equal(summary.actor.role,'main');
  const replay=await f.invoke('save_intake_summary',{requestId:'intake-v1',expectedRevision:0,reason:'Initial background completion from the one-sentence goal and authorized source',content:{objective:'提升老会员在下一季度的复购',facts:['授权资料说明当前会员复购基础'],assumptions:['目标先研究而非直接执行经营动作'],reusableExperiences:[],researchAuthorization:['当前仅允许读取business-source'],businessBoundary:['不执行经营动作，不访问未授权企业系统'],evaluation:['目标值未明确前只评估现状和可验证方向'],followUp:['继续获准范围内的现状研究'],unknowns:['目标值和期间尚未明确'],questions:[{id:'target-metric',question:'希望把复购提升到多少？',impact:'影响评价口径和目标达成判断',blockingScopes:['目标达成评价'],status:'pending'}]}});
  assert.deepEqual(replay,summary);
  await assert.rejects(f.invoke('save_intake_summary',{requestId:'intake-v1-conflict',expectedRevision:0,reason:'Conflicting reuse',content:{objective:'不同目标',facts:[],assumptions:[],reusableExperiences:[],researchAuthorization:[],businessBoundary:[],evaluation:[],followUp:[],unknowns:[],questions:[]}}),{code:'intake_conflict'});
  const context=await f.invoke('research_context',{});assert.equal(context.intake.summary.revision,1);assert.deepEqual(context.intake.summary.content.questions[0].blockingScopes,['目标达成评价']);assert.ok(context.intake.pendingQuestions.length===1);
  const detail=f.coordinator.detail(f.delegation.id);assert.equal(detail.intake.summary.content.objective,'提升老会员在下一季度的复购');assert.equal(detail.intake.pendingQuestions.length,1);
 }finally{await f.close();}
});
