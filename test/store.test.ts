import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SentiStore } from '../src/store.ts';

const storeTestRoot=resolve('.local/tests');
mkdirSync(storeTestRoot,{recursive:true});

const owner = { enterpriseId: 'enterprise-a', principalId: 'operator-a' };

function memoryStore(t: TestContext): SentiStore {
  const store = new SentiStore({ filename: ':memory:' });
  t.after(() => store.close());
  return store;
}

test('a natural goal is retrievable after the host store reopens, without invented research', () => {
  const directory = mkdtempSync(join(storeTestRoot,'store-'));
  const filename = join(directory, 'business.sqlite');
  try {
    const first = new SentiStore({ filename });
    const created = first.create(owner, { goal: '持续关注协作中的变化', idempotencyKey: 'create-1' });
    assert.equal(created.goal, '持续关注协作中的变化');
    assert.equal(created.lifecycle, 'active');
    assert.deepEqual(created.research, { status: 'not_started', reason: 'runtime_unavailable' });
    first.close();

    const reopened = new SentiStore({ filename });
    assert.equal(reopened.get(owner, created.id).goal, '持续关注协作中的变化');
    assert.equal(reopened.list(owner).length, 1);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('owner boundaries apply to lists and exact delegation reads', (t) => {
  const store = memoryStore(t);
  assert.deepEqual(store.list(owner), []);
  const created = store.create(owner, { goal: '持续关注变化', idempotencyKey: 'create-1' });
  for (const other of [
    { ...owner, enterpriseId: 'enterprise-b' },
    { ...owner, principalId: 'operator-b' },
  ]) {
    assert.deepEqual(store.list(other), []);
    assert.throws(() => store.get(other, created.id), { code: 'not_found', status: 404 });
  }
});

test('repeated commands have one effect and conflicting reuse never overwrites the goal', (t) => {
  const store = memoryStore(t);
  assert.throws(() => store.create(owner, { goal: '   ', idempotencyKey: 'invalid' }), { code: 'invalid_input' });
  const input = { goal: '持续关注变化', idempotencyKey: 'create-1' };
  const first = store.create(owner, input);
  const replay = store.create(owner, input);
  assert.equal(replay.id, first.id);
  assert.equal(store.list(owner).length, 1);
  assert.equal(replay.activity.length, 1);
  assert.throws(() => store.create(owner, { ...input, goal: '另一目标' }), { code: 'idempotency_conflict' });
  assert.equal(store.get(owner, first.id).goal, '持续关注变化');
});

test('adjustment preserves original wording and revisions while rejecting stale versions', (t) => {
  const store = memoryStore(t);
  const first = store.create(owner, { goal: '  持续关注变化  ', boundary: '  只做研究  ', idempotencyKey: 'create-1' });
  const input = { expectedVersion: 1, goal: '关注已经明确的差异', boundary: '保留不同解释', idempotencyKey: 'adjust-1' };
  const adjusted = store.adjust(owner, first.id, input);
  assert.equal(adjusted.version, 2);
  assert.equal(adjusted.goalRevision, 2);
  assert.equal(adjusted.goal, '关注已经明确的差异');
  assert.equal(adjusted.revisions.length, 2);
  assert.deepEqual(adjusted.revisions[0].originalInput, { goal: '  持续关注变化  ', boundary: '  只做研究  ' });
  assert.equal(store.adjust(owner, first.id, input).version, 2);
  assert.throws(() => store.adjust(owner, first.id, { ...input, goal: '过期改变', idempotencyKey: 'adjust-stale' }), { code: 'conflict' });
  assert.equal(store.get(owner, first.id).goal, '关注已经明确的差异');
});

test('pause, recovery and ending require matching evidence and late receipts cannot revive a mandate', (t) => {
  const store = memoryStore(t);
  const created = store.create(owner, { goal: '持续关注变化', idempotencyKey: 'create-1' });
  const pausing = store.requestLifecycle(owner, created.id, { expectedVersion: 1, action: 'pause', idempotencyKey: 'pause-1' });
  assert.equal(pausing.lifecycle, 'pausing');
  assert.equal(pausing.goalRevision, 1);
  const pause = pausing.pendingOperation!;
  assert.throws(() => store.completeLifecycle(owner, created.id, { operationId: pause.id, expectedVersion: 1, outcome: 'stopped', evidence: 'outdated callback' }), { code: 'invalid_receipt' });
  assert.equal(store.get(owner, created.id).lifecycle, 'pausing');
  const paused = store.completeLifecycle(owner, created.id, { operationId: pause.id, expectedVersion: pause.requestedVersion, outcome: 'stopped', evidence: 'no_native_resources' });
  assert.equal(paused.lifecycle, 'paused');
  assert.equal(paused.pendingOperation, null);
  const resuming = store.requestLifecycle(owner, created.id, { expectedVersion: paused.version, action: 'resume', idempotencyKey: 'resume-1' });
  assert.equal(resuming.lifecycle, 'resuming');
  const resume = resuming.pendingOperation!;
  const uncertain = store.completeLifecycle(owner, created.id, { operationId: resume.id, expectedVersion: resume.requestedVersion, outcome: 'unknown', evidence: 'runtime qualification unavailable' });
  assert.equal(uncertain.lifecycle, 'resuming');
  assert.equal(uncertain.pendingOperation?.outcome, 'unknown');
  const qualified = store.completeLifecycle(owner, created.id, { operationId: resume.id, expectedVersion: resume.requestedVersion, outcome: 'eligible', evidence: 'qualification checked by Host test adapter' });
  assert.equal(qualified.lifecycle, 'active');
  const ending = store.requestLifecycle(owner, created.id, { expectedVersion: qualified.version, action: 'end', idempotencyKey: 'end-1' });
  assert.equal(ending.lifecycle, 'ending');
  const end = ending.pendingOperation!;
  const ended = store.completeLifecycle(owner, created.id, { operationId: end.id, expectedVersion: end.requestedVersion, outcome: 'stopped', evidence: 'no_native_resources' });
  assert.equal(ended.lifecycle, 'ended');
  const duplicate = store.completeLifecycle(owner, created.id, { operationId: resume.id, expectedVersion: resume.requestedVersion, outcome: 'eligible', evidence: 'qualification checked by Host test adapter' });
  assert.equal(duplicate.lifecycle, 'ended');
  assert.equal(duplicate.version, ended.version);
  assert.throws(() => store.completeLifecycle(owner, created.id, { operationId: resume.id, expectedVersion: resume.requestedVersion, outcome: 'eligible', evidence: 'late unrelated recovery proof' }), { code: 'invalid_receipt' });
  const retained = store.get(owner, created.id);
  assert.equal(retained.lifecycle, 'ended');
  assert.ok(retained.activity.some((entry) => entry.kind === 'lifecycle_receipt_rejected'));
  const related = store.create(owner, { goal: '继续研究新的条件', relatedTo: created.id, idempotencyKey: 'create-related' });
  assert.equal(related.relatedTo, created.id);
  assert.equal(related.lifecycle, 'active');
  assert.equal(store.get(owner, created.id).lifecycle, 'ended');
});

test('a host restart retains an unfinished stop and never invents a completion receipt', () => {
  const directory = mkdtempSync(join(storeTestRoot,'store-'));
  const filename = join(directory, 'business.sqlite');
  try {
    const first = new SentiStore({ filename });
    const created = first.create(owner, { goal: '持续关注变化', idempotencyKey: 'create-1' });
    const stopping = first.requestLifecycle(owner, created.id, { expectedVersion: 1, action: 'pause', idempotencyKey: 'pause-1' });
    first.close();
    const reopened = new SentiStore({ filename });
    const retained = reopened.get(owner, created.id);
    assert.equal(retained.lifecycle, 'pausing');
    assert.equal(retained.pendingOperation?.id, stopping.pendingOperation?.id);
    assert.equal(retained.activity.filter((entry) => entry.kind === 'lifecycle_completed').length, 0);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('supplementary messages persist as operator facts and do not invent model replies or invalidate a stop', () => {
  const directory = mkdtempSync(join(storeTestRoot,'store-'));
  const filename = join(directory, 'business.sqlite');
  try {
    const first = new SentiStore({ filename });
    const created = first.create(owner, { goal: '持续关注变化', idempotencyKey: 'create-1' });
    const pausing = first.requestLifecycle(owner, created.id, { expectedVersion: 1, action: 'pause', idempotencyKey: 'pause-1' });
    const operation = pausing.pendingOperation!;
    const message = { expectedVersion: pausing.version, text: '保留 <b>替代解释</b>，稍后继续。', idempotencyKey: 'message-1' };
    const recorded = first.appendMessage(owner, created.id, message);
    assert.equal(recorded.lifecycle, 'pausing');
    assert.equal(recorded.messages.length, 1);
    assert.equal(recorded.messages[0].role, 'operator');
    assert.equal(recorded.messages[0].text, '保留 <b>替代解释</b>，稍后继续。');
    assert.equal(first.appendMessage(owner, created.id, message).messages.length, 1);
    const paused = first.completeLifecycle(owner, created.id, { operationId: operation.id, expectedVersion: operation.requestedVersion, outcome: 'stopped', evidence: 'no_native_resources' });
    assert.equal(paused.lifecycle, 'paused');
    assert.equal(paused.goalRevision, 1);
    first.close();
    const reopened = new SentiStore({ filename });
    assert.equal(reopened.get(owner, created.id).messages.length, 1);
    assert.equal(reopened.get(owner, created.id).messages[0].role, 'operator');
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('synchronous transactions reject promises and roll back all enclosed public writes', (t) => {
  const store = memoryStore(t);
  assert.throws(() => store.withTransaction(() => {
    store.create(owner, { goal: '不能被异步提交', idempotencyKey: 'promise-create' });
    return Promise.resolve('not a synchronous result');
  }), { code: 'async_transaction' });
  assert.equal(store.list(owner).length, 0);
  assert.throws(() => store.withTransaction(async () => {
    store.create(owner, { goal: '异步函数也不能调用', idempotencyKey: 'async-create' });
  }), { code: 'async_transaction' });
  assert.equal(store.list(owner).length, 0);
  assert.throws(() => store.withTransaction(() => {
    store.create(owner, { goal: '外层回滚保全原子性', idempotencyKey: 'rollback-create' });
    throw new Error('abort outer transaction');
  }), /abort outer transaction/);
  assert.equal(store.list(owner).length, 0);
});

test('known unavailable recovery returns to paused and permits adjustment or ending', (t) => {
  const store = memoryStore(t);
  const created = store.create(owner, { goal: '持续关注变化', idempotencyKey: 'create-1' });
  const stopping = store.requestLifecycle(owner, created.id, { expectedVersion: 1, action: 'pause', idempotencyKey: 'pause-1' });
  const paused = store.completeLifecycle(owner, created.id, { operationId: stopping.pendingOperation!.id, expectedVersion: stopping.pendingOperation!.requestedVersion, outcome: 'stopped', evidence: 'no_native_resources' });
  const resuming = store.requestLifecycle(owner, created.id, { expectedVersion: paused.version, action: 'resume', idempotencyKey: 'resume-1' });
  const unavailable = store.completeLifecycle(owner, created.id, { operationId: resuming.pendingOperation!.id, expectedVersion: resuming.pendingOperation!.requestedVersion, outcome: 'unavailable', evidence: 'Host has not started research; runtime configuration is absent' });
  assert.equal(unavailable.lifecycle, 'paused');
  assert.equal(unavailable.pendingOperation, null);
  assert.ok(unavailable.activity.some((entry) => entry.kind === 'lifecycle_unavailable'));
  const adjusted = store.adjust(owner, created.id, { expectedVersion: unavailable.version, goal: '只调整目标，不推定恢复', idempotencyKey: 'adjust-1' });
  assert.equal(adjusted.lifecycle, 'paused');
  const ending = store.requestLifecycle(owner, created.id, { expectedVersion: adjusted.version, action: 'end', idempotencyKey: 'end-1' });
  assert.equal(ending.lifecycle, 'ending');
});

test('ending supersedes an unknown recovery and an old eligibility callback cannot revive it', (t) => {
  const store = memoryStore(t);
  const created = store.create(owner, { goal: '持续关注变化', idempotencyKey: 'create-1' });
  const stopping = store.requestLifecycle(owner, created.id, { expectedVersion: 1, action: 'pause', idempotencyKey: 'pause-1' });
  const paused = store.completeLifecycle(owner, created.id, { operationId: stopping.pendingOperation!.id, expectedVersion: stopping.pendingOperation!.requestedVersion, outcome: 'stopped', evidence: 'no_native_resources' });
  const resuming = store.requestLifecycle(owner, created.id, { expectedVersion: paused.version, action: 'resume', idempotencyKey: 'resume-1' });
  const recovery = resuming.pendingOperation!;
  const unknown = store.completeLifecycle(owner, created.id, { operationId: recovery.id, expectedVersion: recovery.requestedVersion, outcome: 'unknown', evidence: 'qualification state cannot yet be confirmed' });
  const ending = store.requestLifecycle(owner, created.id, { expectedVersion: unknown.version, action: 'end', idempotencyKey: 'end-1' });
  assert.equal(ending.lifecycle, 'ending');
  assert.notEqual(ending.pendingOperation?.id, recovery.id);
  assert.throws(() => store.completeLifecycle(owner, created.id, { operationId: recovery.id, expectedVersion: recovery.requestedVersion, outcome: 'eligible', evidence: 'late recovery' }), { code: 'invalid_receipt' });
  assert.equal(store.get(owner, created.id).lifecycle, 'ending');
  const ended = store.completeLifecycle(owner, created.id, { operationId: ending.pendingOperation!.id, expectedVersion: ending.pendingOperation!.requestedVersion, outcome: 'stopped', evidence: 'matched end operation stopped' });
  assert.equal(ended.lifecycle, 'ended');
});
