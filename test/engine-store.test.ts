import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Trigger, Thread, Ticket, Decision, Candidate, OutboundMessage } from 'dsh-superagent';
import { SentiStore } from '../src/store.ts';
import { EngineStore } from '../src/engine-store.ts';

const owner = { enterpriseId: 'engine-fixture-enterprise', principalId: 'engine-fixture-operator' };
const at = '2026-11-16T00:00:00.000Z';
const trigger: Trigger = {
  id: 'source-event-1', source: 'fixture', threads: [{ source: 'fixture', id: 'thread-1' }],
  actor: { source: 'fixture', id: 'source-adapter' }, human: false, at,
  text: 'Engineering contract fixture; no business data or model judgment.', meta: { synthetic: true },
};
const root = resolve('.local/archives/engine-runtime-v01-20261116/engine');
mkdirSync(root, { recursive: true });

test('official Trigger data survives close and reopen on the same business SQLite connection', () => {
  const directory = mkdtempSync(join(root, 'repository-test-'));
  const filename = join(directory, 'business.sqlite');
  let store = new SentiStore({ filename });
  const created = store.create(owner, { goal: '持续跟进测试资料中的变化', idempotencyKey: 'create' });
  let adapter = new EngineStore(store, { owner, delegationId: created.id });
  try {
    adapter.repo.atomic(() => adapter.repo.triggers.save(trigger));
    assert.deepEqual(adapter.repo.triggers.get(trigger.id), trigger);
    store.close(); store = new SentiStore({ filename });
    adapter = new EngineStore(store, { owner, delegationId: created.id });
    assert.deepEqual(adapter.repo.triggers.get(trigger.id), trigger);
    assert.equal(store.get(owner, created.id).goal, '持续跟进测试资料中的变化');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

function fixture() {
  const store = new SentiStore({ filename: ':memory:' });
  const delegation = store.create(owner, { goal: '测试持久端口', idempotencyKey: 'create' });
  return { store, delegation, adapter: new EngineStore(store, { owner, delegationId: delegation.id }) };
}

test('official aggregate reads preserve working sets, insertion order and independent object values', () => {
  const { store, adapter } = fixture();
  try {
    const thread: Thread = { key: 'fixture:thread-1', ref: trigger.threads[0], createdAt: at, subscriptions: [], correlated: [], pending: [trigger.id], meta: {} };
    adapter.repo.threads.save(thread);
    assert.deepEqual(adapter.repo.threads.active(), [thread]);
    thread.pending.length = 0;
    assert.deepEqual(adapter.repo.threads.get(thread.key)?.pending, [trigger.id]);
    const detached = adapter.repo.threads.get(thread.key)!;
    detached.meta.unpersisted = true;
    assert.deepEqual(adapter.repo.threads.get(thread.key)?.meta, {});

    const first: Ticket = { id: 'ticket-1', title: 'first', decisionId: 'decision-1', mandate: { strength: 'explicit', policyVersion: 'fixture', basis: { via: 'addressed', addressed: 'direct' }, actor: trigger.actor, scope: 'engineering fixture' }, channels: [], assignments: [{ id: 'assignment-1', state: 'running', createdAt: at }], inputs: [], undelivered: [], createdAt: at, updatedAt: at, origin: { triggerId: trigger.id, triggerIds: [trigger.id] } };
    const second: Ticket = { ...first, id: 'ticket-2', ended: { at, by: 'executor', outcome: 'completed' }, assignments: [{ id: 'assignment-2', state: 'ended', createdAt: at }] };
    adapter.repo.tickets.save(first); adapter.repo.tickets.save(second);
    first.title = 'updated'; adapter.repo.tickets.save(first);
    assert.deepEqual(adapter.repo.tickets.list().map(item => item.id), ['ticket-2', 'ticket-1']);
    assert.deepEqual(adapter.repo.tickets.open().map(item => item.id), ['ticket-1']);
    assert.deepEqual(adapter.repo.tickets.active().map(item => item.id), ['ticket-1']);
    assert.equal(adapter.repo.tickets.get(first.id)?.title, 'updated');

    const decision: Decision = { id: 'decision-1', evalId: 'eval-1', threadKey: thread.key, triggerIds: [trigger.id], policyVersion: 'fixture', at, kind: 'ignore', reason: [], strength: 'explicit' };
    adapter.repo.decisions.save(decision); adapter.repo.decisions.save({ ...decision, id: 'decision-2' });
    assert.deepEqual(adapter.repo.decisions.byThread(thread.key).map(item => item.id), ['decision-1', 'decision-2']);
    assert.deepEqual(adapter.repo.decisions.byThread('different-thread'), []);
    const value = { fanout: ['ticket-1'], at };
    adapter.repo.triggers.saveDisposition(trigger.id, value); value.fanout.push('unpersisted');
    assert.deepEqual(adapter.repo.triggers.disposition(trigger.id)?.fanout, ['ticket-1']);
  } finally { store.close(); }
});

test('aggregate partitions cannot be forged and the same native IDs stay private to each delegation', () => {
  const { store, delegation, adapter } = fixture();
  try {
    const otherOwner = { enterpriseId: 'other-enterprise', principalId: 'other-operator' };
    assert.throws(() => new EngineStore(store, { owner: otherOwner, delegationId: delegation.id }), /未找到/);
    const other = store.create(otherOwner, { goal: '另一个授权域', idempotencyKey: 'create' });
    const otherAdapter = new EngineStore(store, { owner: otherOwner, delegationId: other.id });
    adapter.repo.triggers.save(trigger);
    assert.equal(otherAdapter.repo.triggers.get(trigger.id), undefined);
    otherAdapter.repo.triggers.save({ ...trigger, text: 'other namespace' });
    assert.equal(adapter.repo.triggers.get(trigger.id)?.text, trigger.text);
    assert.equal(otherAdapter.repo.triggers.get(trigger.id)?.text, 'other namespace');
  } finally { store.close(); }
});

test('business records and official aggregate writes roll back in one synchronous transaction', () => {
  const { store, delegation, adapter } = fixture();
  try {
    assert.throws(() => store.withTransaction(() => {
      adapter.repo.atomic(() => adapter.repo.triggers.save(trigger));
      store.appendMessage(owner, delegation.id, { expectedVersion: 1, idempotencyKey: 'message', text: 'must roll back' });
      throw new Error('engineering transaction failure');
    }), /engineering transaction failure/);
    assert.equal(adapter.repo.triggers.get(trigger.id), undefined);
    assert.deepEqual(store.get(owner, delegation.id).messages, []);
    assert.equal(store.get(owner, delegation.id).version, 1);
  } finally { store.close(); }
});

const candidate: Candidate = {
  evalId: 'eval-intent-1', strength: 'inferred', policyVersion: 'fixture', triggers: [trigger], tickets: [],
  thread: { key: 'fixture:thread-1', ref: trigger.threads[0], createdAt: at, subscriptions: [], correlated: [], pending: [], meta: {} },
};

test('assessment dispatch facts are durable, immutable by alias, single-claim and UNKNOWN is never auto-requeued', () => {
  const directory = mkdtempSync(join(root, 'intent-test-'));
  const filename = join(directory, 'business.sqlite');
  let store = new SentiStore({ filename });
  const created = store.create(owner, { goal: '测试投递事实', idempotencyKey: 'create' });
  let adapter = new EngineStore(store, { owner, delegationId: created.id });
  try {
    adapter.repo.atomic(() => adapter.assessor.request(candidate));
    const queued = adapter.listPending();
    assert.equal(queued.length, 1);
    assert.equal(queued[0].kind, 'assess');
    adapter.assessor.request({ ...candidate, policyVersion: 'do-not-overwrite-first-payload' });
    assert.equal(adapter.listPending().length, 1);
    assert.deepEqual(adapter.get(queued[0].id)?.payload, { candidate });
    queued[0].payload.changed = true;
    assert.deepEqual(adapter.get(queued[0].id)?.payload, { candidate });
    const claimed = adapter.claim(queued[0].id)!;
    assert.equal(claimed.state, 'claimed');
    assert.equal(adapter.claim(claimed.id), undefined);
    adapter.settle(claimed.id, { state: 'unknown', nativeMessageId: 'native-1', receipt: { reason: 'admission receipt unavailable' } });
    assert.equal(adapter.claim(claimed.id), undefined);
    store.close(); store = new SentiStore({ filename });
    adapter = new EngineStore(store, { owner, delegationId: created.id });
    assert.equal(adapter.get(claimed.id)?.state, 'unknown');
    assert.deepEqual(adapter.listPending(), []);
    assert.equal(adapter.get(claimed.id)?.nativeMessageId, 'native-1');
    adapter.settle(claimed.id, { state: 'sent', nativeMessageId: 'native-1', receipt: { reconciledFromNativeInbox: true } });
    assert.equal(adapter.get(claimed.id)?.state, 'sent');
    assert.throws(() => adapter.settle(claimed.id, { state: 'dropped' }), /回执|状态/);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('executor and assessor ports persist exact synchronous effect facts without ticket transitions', () => {
  const { store, adapter } = fixture();
  try {
    const assignment = { id: 'assignment-effects', state: 'running' as const, createdAt: at };
    const ticket: Ticket = {
      id: 'ticket-effects', title: 'Effect fixture', decisionId: 'decision-effects',
      mandate: { strength: 'explicit', policyVersion: 'fixture', basis: { via: 'addressed', addressed: 'direct' }, actor: trigger.actor, scope: 'engineering fixture' },
      channels: [], assignments: [assignment], inputs: [{ id: 'input-1', kind: 'text', text: 'fixture', at }],
      undelivered: ['input-1'], createdAt: at, updatedAt: at, origin: { triggerId: trigger.id, triggerIds: [trigger.id] },
    };
    adapter.repo.tickets.save(ticket);
    adapter.executor.start(ticket, assignment); adapter.executor.start(ticket, assignment);
    adapter.executor.deliver(ticket, assignment); adapter.executor.deliver(ticket, assignment);
    ticket.undelivered.push('input-2');
    adapter.executor.deliver(ticket, assignment);
    adapter.executor.stop(ticket, assignment, 'operator pause');
    adapter.executor.stop(ticket, assignment, 'operator pause');
    adapter.executor.stop(ticket, assignment, 'operator end');
    adapter.assessor.release!(candidate.evalId); adapter.assessor.release!(candidate.evalId);
    assert.deepEqual(adapter.listPending().map(intent => intent.kind), ['start', 'deliver', 'deliver', 'stop', 'stop', 'release-assessment']);
    const deliveries = adapter.listPending().filter(intent => intent.kind === 'deliver');
    assert.deepEqual(deliveries.map(intent => intent.payload.inputIds), [['input-1'], ['input-1', 'input-2']]);
    assert.equal(adapter.repo.tickets.get(ticket.id)?.assignments[0].state, 'running');
    assert.deepEqual(adapter.repo.tickets.get(ticket.id)?.undelivered, ['input-1']);
    const before = adapter.listPending();
    assert.throws(() => store.withTransaction(() => {
      adapter.assessor.request(candidate);
      adapter.repo.triggers.save(trigger);
      throw new Error('rollback effects with aggregates');
    }), /rollback effects/);
    assert.deepEqual(adapter.listPending(), before);
    assert.equal(adapter.repo.triggers.get(trigger.id), undefined);
    const other = store.create(owner, { goal: '另一个委托', idempotencyKey: 'other' });
    const isolated = new EngineStore(store, { owner, delegationId: other.id });
    assert.deepEqual(isolated.listPending(), []);
    assert.equal(isolated.get(before[0].id), undefined);
    assert.equal(isolated.claim(before[0].id), undefined);
    assert.equal(isolated.settle(before[0].id, { state: 'sent' }), undefined);
  } finally { store.close(); }
});

test('outbox preserves first-message semantics, withdrawal and uncertain in-flight generations', () => {
  const { store, adapter } = fixture();
  try {
    const message: OutboundMessage = { id: 'outbound-1', channel: { source: 'workspace', thread: 'fixture-channel', address: {} }, text: 'first message', kind: 'notice' };
    adapter.outbox.send(message);
    adapter.outbox.send({ ...message, text: 'must keep first' });
    assert.equal(adapter.outbox.status(message.id), 'pending');
    const first = adapter.listPending()[0];
    assert.deepEqual(first.payload.message, message);
    adapter.outbox.withdraw(message.id);
    assert.equal(adapter.outbox.status(message.id), undefined);
    assert.equal(adapter.get(first.id)?.state, 'dropped');

    const secondMessage = { ...message, text: 'after withdrawal' };
    adapter.outbox.send(secondMessage);
    const second = adapter.listPending()[0];
    assert.notEqual(second.id, first.id);
    assert.deepEqual(second.payload.message, secondMessage);
    adapter.claim(second.id);
    adapter.outbox.withdraw(message.id);
    assert.equal(adapter.outbox.status(message.id), undefined);
    assert.equal(adapter.get(second.id)?.state, 'claimed');
    adapter.settle(second.id, { state: 'unknown', receipt: { lostNativeReceipt: true } });
    adapter.outbox.send({ ...message, text: 'new enqueue waits for actual reconciliation' });
    const third = adapter.listPending()[0];
    assert.equal(adapter.claim(third.id), undefined);
    assert.equal(adapter.get(third.id)?.state, 'pending');
    adapter.settle(second.id, { state: 'sent', nativeMessageId: 'actual-message' });
    assert.equal(adapter.outbox.status(message.id), 'sent');
    assert.equal(adapter.get(third.id)?.state, 'dropped');
    assert.equal(adapter.get(second.id)?.state, 'sent');
    adapter.outbox.send({ ...message, text: 'sent message stays final' });
    adapter.outbox.withdraw(message.id);
    assert.deepEqual(adapter.listPending(), []);
    assert.equal(adapter.outbox.status(message.id), 'sent');

    const dropped = { ...message, id: 'outbound-2' };
    adapter.outbox.send(dropped);
    const pending = adapter.listPending()[0];
    adapter.claim(pending.id); adapter.settle(pending.id, { state: 'dropped', receipt: { channelGone: true } });
    assert.equal(adapter.outbox.status(dropped.id), 'dropped');
    adapter.outbox.withdraw(dropped.id); adapter.outbox.send({ ...dropped, text: 'cannot replace final receipt' });
    assert.deepEqual(adapter.listPending(), []);
    assert.equal(adapter.outbox.status(dropped.id), 'dropped');
  } finally { store.close(); }
});

test('outbox receipts, withdraw history and held dispatch survive restart and share aggregate rollback', () => {
  const directory = mkdtempSync(join(root, 'outbox-restart-test-'));
  const filename = join(directory, 'business.sqlite');
  let store = new SentiStore({ filename });
  const delegation = store.create(owner, { goal: '测试回执恢复', idempotencyKey: 'create' });
  let adapter = new EngineStore(store, { owner, delegationId: delegation.id });
  const message: OutboundMessage = { id: 'restart-message', channel: { source: 'workspace', thread: 'restart-thread', address: {} }, text: 'restart fixture', kind: 'notice' };
  try {
    assert.throws(() => store.withTransaction(() => {
      adapter.repo.triggers.save(trigger);
      adapter.outbox.send(message);
      throw new Error('rollback outbox and receipt');
    }), /rollback outbox/);
    assert.equal(adapter.outbox.status(message.id), undefined);
    assert.deepEqual(adapter.listPending(), []);
    assert.equal(adapter.repo.triggers.get(trigger.id), undefined);
    adapter.outbox.send(message);
    const dispatched = adapter.listPending()[0];
    adapter.claim(dispatched.id);
    adapter.outbox.withdraw(message.id);
    adapter.settle(dispatched.id, { state: 'unknown', receipt: { reason: 'interrupted native admission' } });
    adapter.outbox.send({ ...message, text: 'held generation' });
    const held = adapter.listPending()[0];
    store.close(); store = new SentiStore({ filename });
    adapter = new EngineStore(store, { owner, delegationId: delegation.id });
    assert.equal(adapter.get(dispatched.id)?.state, 'unknown');
    assert.equal(adapter.claim(held.id), undefined);
    adapter.settle(dispatched.id, { state: 'dropped', receipt: { reconciledNotAdmitted: true } });
    assert.equal(adapter.outbox.status(message.id), 'pending');
    assert.equal(adapter.claim(held.id)?.state, 'claimed');
    adapter.settle(held.id, { state: 'sent', nativeMessageId: 'native-after-reconciliation' });
    assert.equal(adapter.outbox.status(message.id), 'sent');
    const events = store.connection.prepare('SELECT detail FROM engine_intent_events WHERE intent_id=? ORDER BY seq').all(dispatched.id)
      .map(row => JSON.parse(String(row.detail)) as Record<string, unknown>);
    assert.equal(events.some(event => event.action === 'withdraw'), true);
    assert.equal(events.some(event => event.state === 'unknown'), true);
    assert.equal(events.some(event => event.state === 'dropped'), true);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('known non-admission can be requested again by the official port while sent and uncertain intents stay deduplicated', () => {
  const { store, adapter } = fixture();
  try {
    adapter.assessor.request(candidate);
    const first = adapter.listPending()[0];
    adapter.settle(first.id, { state: 'dropped', receipt: { reason: 'qualification-withdrawn-before-admission' } });
    adapter.assessor.request(candidate);
    const next = adapter.listPending()[0];
    assert.notEqual(next.id, first.id);
    assert.equal(next.key, candidate.evalId);
    assert.equal(adapter.get(first.id)?.state, 'dropped');
    adapter.claim(next.id);
    assert.deepEqual(adapter.listUnsettled().map(intent => intent.id), [next.id]);
    adapter.settle(next.id, { state: 'unknown' });
    adapter.assessor.request(candidate);
    assert.deepEqual(adapter.listPending(), []);
    assert.deepEqual(adapter.listUnsettled().map(intent => intent.id), [next.id]);
    adapter.settle(next.id, { state: 'sent', nativeMessageId: 'confirmed-admission' });
    adapter.assessor.request(candidate);
    assert.deepEqual(adapter.listPending(), []);
    assert.deepEqual(adapter.listUnsettled(), []);
  } finally { store.close(); }
});

test('launch and exact-batch delivery retry only after known non-admission and a new official request', () => {
  const { store, adapter } = fixture();
  try {
    const assignment = { id: 'retry-assignment', state: 'pending' as const, createdAt: at };
    const ticket: Ticket = {
      id: 'retry-ticket', title: 'Retry fixture', decisionId: 'retry-decision',
      mandate: { strength: 'explicit', policyVersion: 'fixture', basis: { via: 'addressed', addressed: 'direct' }, actor: trigger.actor, scope: 'engineering fixture' },
      channels: [], assignments: [assignment], inputs: [{ id: 'retry-input', kind: 'text', text: 'fixture', at }],
      undelivered: ['retry-input'], createdAt: at, updatedAt: at, origin: { triggerId: trigger.id, triggerIds: [trigger.id] },
    };
    adapter.executor.start(ticket, assignment);
    const failed = adapter.listPending()[0];
    adapter.claim(failed.id); adapter.settle(failed.id, { state: 'dropped', receipt: { notAdmitted: true } });
    assert.deepEqual(adapter.listPending(), []);
    adapter.executor.start(ticket, assignment);
    const launched = adapter.listPending()[0];
    assert.equal(launched.generation, 2);
    adapter.claim(launched.id); adapter.settle(launched.id, { state: 'sent' });
    adapter.executor.start(ticket, assignment);
    assert.deepEqual(adapter.listPending(), []);
    adapter.executor.deliver(ticket, assignment);
    const delivery = adapter.listPending()[0];
    adapter.claim(delivery.id); adapter.settle(delivery.id, { state: 'unknown' });
    adapter.executor.deliver(ticket, assignment);
    assert.deepEqual(adapter.listPending(), []);
    adapter.settle(delivery.id, { state: 'dropped', receipt: { reconciledNotAdmitted: true } });
    assert.deepEqual(adapter.listPending(), []);
    adapter.executor.deliver(ticket, assignment);
    const resumed = adapter.listPending()[0];
    assert.equal(resumed.generation, 2);
    adapter.claim(resumed.id); adapter.settle(resumed.id, { state: 'sent' });
    adapter.executor.deliver(ticket, assignment);
    assert.deepEqual(adapter.listPending(), []);
  } finally { store.close(); }
});
