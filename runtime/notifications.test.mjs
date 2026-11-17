import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from 'dsh-superagent';
import {SentiStore} from '../src/store.ts';
import {ResearchCoordinator} from '../src/research.ts';

async function boot(){const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'notification-runtime-fixture',principalId:'operator'},opened=[],schedules=[];
 const native={async open(binding,options){const handle={binding,sessionId:options.sessionId,configured:true,async deliver(m){return{accepted:true,messageId:m.id};},cancel(){},async whenIdle(){},async dispose(){},async createSchedule(request){const row={id:`schedule-${schedules.length}`,status:'active',target:{kind:'session',sessionId:options.sessionId},...request};schedules.push(row);return row;},async disableSchedule(id){const row=schedules.find(r=>r.id===id);if(row)row.status='paused';},async listSchedules(){return schedules;}};opened.push({binding,options,handle});return handle;},async dispose(){}};
 const c=new ResearchCoordinator({store,owner,native,Engine,model:{provider:'local-fixture',model:'synthetic'},notificationDefaults:{timeZone:'UTC',time:'00:00:00',weekdays:[1,2,3,4,5,6,7]}}),d=store.create(owner,{goal:'Synthetic notifications only',idempotencyKey:'create'});await c.sync(d.id);
 const main=()=>opened.find(r=>r.binding.role==='main');const invoke=(name,args)=>{const tool=main().options.tools.find(t=>t.name===name);assert.ok(tool,`Missing Agent capability ${name}`);return tool.execute(args,{signal:new AbortController().signal});};return{store,c,d,main,invoke,schedules,async close(){await c.close();store.close();}};
}
const judgment={kind:'judgment',title:'Synthetic judgment',summary:'Only fixture evidence',evidence:[],assumptions:[],unknowns:['No business quality claim'],applicability:'Synthetic only',invalidatedBy:['New evidence']};
test('a due native workday brief bypasses only the observation wait; no-change stops the extra wake and important matter revisions merge',async()=>{
 const f=await boot();try{
  const a=await f.invoke('publish_artifact',{expectedVersion:0,requestId:'artifact',reason:'Synthetic finite observation',content:judgment});
  await f.invoke('arrange_followup',{requestId:'wait',artifact:{artifactId:a.artifactId,version:1},reason:'Wait for observation without empty polling',dependencies:[],trigger:{kind:'at',at:new Date(Date.now()+60000).toISOString()}});
  assert.ok(f.schedules.some(row=>row.timing.kind==='weekly'),'Brief must use an owned native weekly Schedule');
  assert.notEqual(await f.main().options.beforeStep(f.main().binding,{turn:2,step:1,scheduledOnly:true}),false,'Due brief is independent of a research observation wait');
  let context=await f.invoke('research_context',{});assert.ok(context.notificationWork.brief?.due);
  await f.invoke('publish_brief',{requestId:'empty-check',windowKey:context.notificationWork.brief.key,summary:'No material changes after checking current matters'});
  assert.equal(f.c.detail(f.d.id).notificationFeed.checkState.status,'no_change');assert.equal(f.c.detail(f.d.id).notificationFeed.notices.length,0);
  assert.equal(await f.main().options.beforeStep(f.main().binding,{turn:3,step:1,scheduledOnly:true}),false);
  const matter=await f.invoke('publish_notification',{expectedRevision:0,requestId:'notice',kind:'inform',artifact:{artifactId:a.artifactId,version:1},title:'An evidenced change',summary:'Qualified finite change',changes:['New relevant synthetic observation'],unknowns:['Not a business result'],mergeReason:'Same persistent synthetic issue',urgency:'immediate',immediateReason:'Waiting for the next brief would lose an important attention window'});
  const one=await f.invoke('publish_important_change',{id:matter.id,revision:1,requestId:'important'});const replay=await f.invoke('publish_important_change',{id:matter.id,revision:1,requestId:'important'});assert.equal(one.id,replay.id);
  assert.equal(f.c.detail(f.d.id).notificationFeed.matters.length,1);assert.equal(f.c.detail(f.d.id).notificationFeed.notices.filter(n=>n.qualification==='current').length,1);
  assert.equal(f.c.detail(f.d.id).operatorChoices.length,0);
 }finally{await f.close();}
});
