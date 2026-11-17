import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SentiStore } from '../src/store.ts';
import { ControlDelivery } from '../src/control.ts';
import type { LifecycleControlPort } from '../src/control.ts';

const owner = { enterpriseId: 'enterprise-a', principalId: 'operator-a' };
const testRoot = resolve('.local/tests');
mkdirSync(testRoot, { recursive: true });

test('an intent committed before dispatch can be recovered once after a restart', async () => {
  const directory = mkdtempSync(join(testRoot, 'control-recorded-'));
  const filename = join(directory, 'business.sqlite');
  let store = new SentiStore({ filename });
  let calls = 0;
  const port: LifecycleControlPort = {
    status: { status: 'test_boundary', message: '合成回执边界' },
    async settle() { calls += 1; return { outcome: 'stopped', evidence: '合成边界确认无在途资源' }; },
  };
  const first = new ControlDelivery(store, owner, port);
  const created = store.create(owner, { goal: '持续跟进', idempotencyKey: 'create-recovery' });
  store.withTransaction(() => {
    const item = store.requestLifecycle(owner, created.id, { expectedVersion: 1, action: 'pause', idempotencyKey: 'pause-recovery' });
    first.record(item, 1, 'pause');
  });
  store.close(); // No port was called: simulate interruption between commit and dispatch.
  store = new SentiStore({ filename });
  const resumed = new ControlDelivery(store, owner, port);
  try {
    await resumed.recoverRecorded();
    assert.equal(calls, 1);
    assert.equal(store.get(owner, created.id).lifecycle, 'paused');
    await resumed.recoverRecorded();
    assert.equal(calls, 1);
  } finally { resumed.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('an already dispatched request without a receipt remains UNKNOWN and is not replayed', async () => {
  const directory = mkdtempSync(join(testRoot, 'control-dispatched-'));
  const filename = join(directory, 'business.sqlite');
  let store = new SentiStore({ filename });
  let calls = 0;
  const port: LifecycleControlPort = {
    status: { status: 'test_boundary', message: '合成回执边界' },
    async settle() { calls += 1; return new Promise(() => {}); },
  };
  const first = new ControlDelivery(store, owner, port);
  const created = store.create(owner, { goal: '持续跟进', idempotencyKey: 'create-unknown' });
  const item = store.withTransaction(() => {
    const requested = store.requestLifecycle(owner, created.id, { expectedVersion: 1, action: 'pause', idempotencyKey: 'pause-unknown' });
    first.record(requested, 1, 'pause'); return requested;
  });
  void first.dispatch(item.id, item.pendingOperation!);
  assert.equal(calls, 1);
  store.close(); // The external call was made, but no receipt was returned.
  store = new SentiStore({ filename });
  const resumed = new ControlDelivery(store, owner, port);
  try {
    await resumed.recoverRecorded();
    assert.equal(calls, 1);
    const current = store.get(owner, item.id);
    assert.equal(current.lifecycle, 'pausing');
    assert.equal(current.pendingOperation?.outcome, 'unknown');
    assert.ok(current.activity.some((event) => event.kind === 'lifecycle_unknown'));
  } finally { resumed.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
