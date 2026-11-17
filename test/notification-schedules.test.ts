import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SentiStore} from '../src/store.ts';
import {NotificationSchedules} from '../src/notification-schedules.ts';

test('brief timing reuses persisted Host preferences and defaults to local workdays without operator setup',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'notification-timing-fixture',principalId:'operator'};
 try{const d=store.create(owner,{goal:'Synthetic workday brief',idempotencyKey:'create'});
  const first=new NotificationSchedules(store,{owner,delegationId:d.id},{isCurrent:()=>true,defaults:{timeZone:'UTC',time:'17:00:00',weekdays:[1,2,3,4,5]}});
  assert.deepEqual(first.preferences(),{revision:1,timeZone:'UTC',time:'17:00:00',weekdays:[1,2,3,4,5]});
  const reopened=new NotificationSchedules(store,{owner,delegationId:d.id},{isCurrent:()=>true,defaults:{timeZone:'UTC',time:'18:00:00',weekdays:[1]}});
  assert.deepEqual(reopened.preferences(),first.preferences(),'Defaults must not reset a stored valid preference on reopen');
 }finally{store.close();}
});
test('pausing during creation retains the business responsibility after a late exact ID is stopped and a fresh main resumes',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'notification-pause-fixture',principalId:'operator'};
 try{const d=store.create(owner,{goal:'Synthetic pause and late creation',idempotencyKey:'create'}),binding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main' as const};let generation=1;
  const tasks=new NotificationSchedules(store,{owner,delegationId:d.id},{isCurrent:b=>b.generation===generation});const plans=[{key:'weekly',kind:'brief' as const,timing:{kind:'weekly' as const,weekly:{time:'17:00:00',time_zone:'UTC',weekdays:[1]}}}];const [r]=tasks.reconcile(binding,plans);tasks.prepare(binding,r.id,'old-session');
  const pausing=store.requestLifecycle(owner,d.id,{action:'pause',expectedVersion:1,idempotencyKey:'pause'});tasks.pause();store.completeLifecycle(owner,d.id,{operationId:pausing.pendingOperation!.id,expectedVersion:pausing.pendingOperation!.requestedVersion,outcome:'stopped',evidence:'Synthetic controlled native cleanup'});
  const late=tasks.attach(binding,r.id,'old-session','old-exact-task');assert.equal(late.schedule.status,'stop_pending');assert.equal(late.status,'pending','A late resource receipt must not discard paused business responsibility');tasks.stopped(r.id);
  const resuming=store.requestLifecycle(owner,d.id,{action:'resume',expectedVersion:store.get(owner,d.id).version,idempotencyKey:'resume'});store.completeLifecycle(owner,d.id,{operationId:resuming.pendingOperation!.id,expectedVersion:resuming.pendingOperation!.requestedVersion,outcome:'eligible',evidence:'Synthetic restored current qualification'});generation=2;const fresh={...binding,generation};
  assert.equal(tasks.reconcile(fresh,plans)[0].status,'pending');assert.equal(tasks.prepare(fresh,r.id,'new-session').schedule.status,'creating');assert.equal(tasks.get(r.id).previousSchedules?.[0].id,'old-exact-task');
 }finally{store.close();}
});
test('a due decision point records an explicit check once, supersedes old plans and never promotes a choice',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'notification-window-fixture',principalId:'operator'};let now='2026-11-17T04:00:00.000Z';
 try{const d=store.create(owner,{goal:'Synthetic exact decision point',idempotencyKey:'create'}),binding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main' as const};const tasks=new NotificationSchedules(store,{owner,delegationId:d.id},{isCurrent:()=>true,now:()=>now});
  const [r]=tasks.reconcile(binding,[{key:'d-r1-remind',kind:'decision',decision:{id:'decision-one',revision:1},point:'remindAt',at:'2026-11-17T05:00:00.000Z',timing:{kind:'at',at:'2026-11-17T05:00:00.000Z'}}]);assert.equal(tasks.due(binding).length,0);
  now='2026-11-17T05:00:00.000Z';assert.equal(tasks.due(binding)[0].id,r.id);assert.equal(tasks.get(r.id).status,'due');
  tasks.check(binding,r.id,{requestId:'check',reason:'Agent reviewed the exact agreed point'});assert.equal(tasks.due(binding).length,0);assert.equal(tasks.get(r.id).status,'checked');assert.equal('adopted' in tasks.get(r.id),false);
  assert.equal(tasks.check(binding,r.id,{requestId:'check',reason:'Agent reviewed the exact agreed point'}).status,'checked');assert.throws(()=>tasks.check(binding,r.id,{requestId:'other',reason:'Another fixed nag'}),{code:'notification_schedule_conflict'});
  const updated=store.adjust(owner,d.id,{goal:'Changed synthetic goal',expectedVersion:1,idempotencyKey:'adjust'});const next={...binding,goalRevision:updated.goalRevision};tasks.reconcile(next,[]);assert.throws(()=>tasks.prepare(next,r.id,'new-session'),{code:'notification_schedule_stale'});
 }finally{store.close();}
});
test('preference revisions are Host-bound and reject invalid timezones, times, ISO weekdays and stale changes',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'notification-preferences-fixture',principalId:'operator'};
 try{const d=store.create(owner,{goal:'Synthetic valid preferences',idempotencyKey:'create'});const tasks=new NotificationSchedules(store,{owner,delegationId:d.id},{isCurrent:()=>true});const prior=tasks.preferences();
  for(const input of [{...prior,timeZone:'bad-zone'},{...prior,time:'25:00:00'},{...prior,weekdays:[0]},{...prior,weekdays:[1,1]}])assert.throws(()=>tasks.configure(input,1),{code:'notification_preferences_invalid'});
  const next=tasks.configure({timeZone:'UTC',time:'18:00:00',weekdays:[1,2,3,4,5]},1);assert.equal(next.revision,2);assert.throws(()=>tasks.configure(prior,1),{code:'notification_preferences_conflict'});
  const b={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main' as const};assert.throws(()=>tasks.reconcile({...b,role:'worker'},[]),{code:'notification_schedule_scope'});assert.throws(()=>tasks.reconcile({...b,owner:{...owner,principalId:'other'}},[]),{code:'notification_schedule_scope'});
 }finally{store.close();}
});
test('equivalent owner identities reuse the same preference namespace regardless of JSON property order',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'notification-identity-fixture',principalId:'operator'};
 try{const d=store.create(owner,{goal:'Synthetic owner identity',idempotencyKey:'create'});const first=new NotificationSchedules(store,{owner,delegationId:d.id},{isCurrent:()=>true,defaults:{timeZone:'UTC',time:'17:00:00',weekdays:[1]}});
  const reversed=new NotificationSchedules(store,{owner:{principalId:owner.principalId,enterpriseId:owner.enterpriseId},delegationId:d.id},{isCurrent:()=>true,defaults:{timeZone:'UTC',time:'18:00:00',weekdays:[2]}});assert.deepEqual(reversed.preferences(),first.preferences());
 }finally{store.close();}
});
test('a repeated authoritative creation receipt cannot revive an already stopped exact native task',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'notification-receipt-fixture',principalId:'operator'};
 try{const d=store.create(owner,{goal:'Synthetic late native receipt',idempotencyKey:'create'}),binding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main' as const};
  const tasks=new NotificationSchedules(store,{owner,delegationId:d.id},{isCurrent:()=>true});const [record]=tasks.reconcile(binding,[{key:'weekly',kind:'brief',timing:{kind:'weekly',weekly:{time:'17:00:00',time_zone:'UTC',weekdays:[1]}}}]);tasks.prepare(binding,record.id,'owned-session');tasks.attach(binding,record.id,'owned-session','owned-task');tasks.pause();tasks.stopped(record.id);
  assert.equal(tasks.attach(binding,record.id,'owned-session','owned-task').schedule.status,'stopped');assert.throws(()=>tasks.attach(binding,record.id,'owned-session','foreign-task'),{code:'notification_schedule_conflict'});
 }finally{store.close();}
});
test('native creation is durably claimed before calling Schedule and uncertainty never creates a replacement',()=>{
 const store=new SentiStore({filename:':memory:'}),owner={enterpriseId:'notification-timing-fixture',principalId:'operator'};
 try{const d=store.create(owner,{goal:'Synthetic native receipt',idempotencyKey:'create'}),binding={owner,delegationId:d.id,goalRevision:1,epoch:0,generation:1,role:'main' as const};
  const options={isCurrent:()=>true,now:()=> '2026-11-17T04:00:00.000Z'},tasks=new NotificationSchedules(store,{owner,delegationId:d.id},options);
  const plans=[{key:'brief-1',kind:'brief' as const,timing:{kind:'weekly' as const,weekly:{time:'17:00:00',time_zone:'UTC',weekdays:[1,2,3,4,5]}}}];
  const [record]=tasks.reconcile(binding,plans);assert.equal(record.schedule.status,'none');
  tasks.prepare(binding,record.id,'exact-main-session');assert.equal(tasks.list()[0].schedule.status,'creating');tasks.unknown(record.id);
  const reopened=new NotificationSchedules(store,{owner,delegationId:d.id},options);assert.equal(reopened.reconcile(binding,plans)[0].schedule.status,'unknown');
  assert.throws(()=>reopened.prepare(binding,record.id,'exact-main-session'),{code:'notification_schedule_unknown'});
 }finally{store.close();}
});
