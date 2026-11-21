import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SentiStore } from '../src/store.ts';
import { startLocalHost } from '../src/server.ts';
import type { LocalHostOptions } from '../src/server.ts';

const owner = { enterpriseId: 'research-http-fixture', principalId: 'research-http-fixture' };

test('HTTP projections show actual optional research data and GET never starts research', async () => {
  const store = new SentiStore({ filename: ':memory:' });
  const item = store.create(owner, { goal: '仅供HTTP接缝检查的持续目标', idempotencyKey: 'create' });
  let notifications = 0;
  const projection = {
    researchStatus: { status: 'researching' },
    research: [{ id: 'official-ticket-fixture', title: '已有研究工单', assignments: [], inputs: [], undelivered: [] }],
    artifacts: [{ id: 'artifact-fixture', ticketId: 'official-ticket-fixture', state: 'ready', summary: '<img src=x onerror=alert(1)>', evidence: [{ ref: 'exact-source-ref', hash: 'exact-source-hash' }], createdAt: '2026-11-16T00:00:00Z', goalRevision: 1, qualification: 'current' }],
    sources: [{ sourceId: 'fixture', status: 'ready', grantRevision: 1, lastCheckedAt: '2026-11-16T00:00:00Z', reason: null }],
    sourceReferences: [{ ref: 'exact-source-ref', sourceId: 'fixture', relativePath: 'synthetic.md', version: 'exact-source-hash', hash: 'exact-source-hash', bytes: 10, sourceModifiedAt: '2026-11-15T00:00:00Z', observedAt: '2026-11-16T00:00:00Z', grantRevision: 1 }],
    technical: [{ kind: 'research-runtime-fixture', detail: { state: 'ready' }, createdAt: '2026-11-16T00:00:00Z' }],
    deliveries: [{ kind: 'report', state: 'saved' }],
  };
  const researchPort = { status: { status: 'sdk_ready', message: '合成HTTP投影，不是模型验证' }, detail: () => projection, changed: () => { notifications += 1; } };
  // The cast keeps the pre-implementation seam callable; a missing option is a behavior failure, not a compile RED.
  const options = { store, owner, researchPort, allowUnauthenticated: true } as LocalHostOptions;
  const host = await startLocalHost(options);
  try {
    const health = await (await fetch(`${host.url}/api/health`)).json() as { runtime: unknown };
    assert.deepEqual(health.runtime, researchPort.status);
    const list = await (await fetch(`${host.url}/api/delegations`)).json() as { delegations: { research: unknown }[]; runtime: unknown };
    assert.deepEqual(list.runtime, researchPort.status); assert.deepEqual(list.delegations[0].research, projection.researchStatus);
    const detail = await (await fetch(`${host.url}/api/delegations/${item.id}`)).json() as Record<string, unknown>;
    assert.deepEqual(detail.research, projection.research); assert.deepEqual(detail.artifacts, projection.artifacts);
    assert.deepEqual(detail.sources, projection.sources); assert.deepEqual(detail.sourceReferences, projection.sourceReferences);
    assert.deepEqual(detail.technical, projection.technical); assert.deepEqual(detail.deliveries, projection.deliveries);
    assert.deepEqual((detail.delegation as { research: unknown }).research, projection.researchStatus);
    assert.equal(notifications, 0);
    assert.equal((await fetch(`${host.url}/api/delegations/not-owned`)).status, 404);
    assert.equal(notifications, 0);
  } finally { await host.close(); store.close(); }
});

test('successful create, adjustment and background messages notify research after the records are saved', async () => {
  const store = new SentiStore({ filename: ':memory:' });
  const notifications: { id: string; goal: string; messages: number }[] = [];
  const host = await startLocalHost({ allowUnauthenticated: true,  store, owner, researchPort: {
    status: { status: 'sdk_ready', message: '合成通知边界' }, detail: () => ({}),
    changed(id) { const item = store.get(owner, id); notifications.push({ id, goal: item.goal, messages: item.messages.length }); },
  } });
  const post = (path: string, body: Record<string, unknown>) => fetch(`${host.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const created = await post('/api/delegations', { goal: 'initial synthetic goal', idempotencyKey: 'create' });
    assert.equal(created.status, 201);
    const first = await created.json() as { delegation: { id: string; version: number } };
    assert.deepEqual(notifications, [{ id: first.delegation.id, goal: 'initial synthetic goal', messages: 0 }]);
    const path = `/api/delegations/${first.delegation.id}/commands`;
    const adjusted = await post(path, { kind: 'adjust', goal: 'revised synthetic goal', expectedVersion: first.delegation.version, idempotencyKey: 'adjust' });
    assert.equal(adjusted.status, 200);
    const second = await adjusted.json() as { delegation: { version: number } };
    const message = await post(path, { kind: 'message', text: 'synthetic context', expectedVersion: second.delegation.version, idempotencyKey: 'message' });
    assert.equal(message.status, 200);
    assert.deepEqual(notifications, [
      { id: first.delegation.id, goal: 'initial synthetic goal', messages: 0 },
      { id: first.delegation.id, goal: 'revised synthetic goal', messages: 0 },
      { id: first.delegation.id, goal: 'revised synthetic goal', messages: 1 },
    ]);
    const rejected = await post(path, { kind: 'message', text: 'rejected old version', expectedVersion: 1, idempotencyKey: 'rejected' });
    assert.equal(rejected.status, 409); assert.equal(notifications.length, 3);
    await fetch(`${host.url}/api/delegations`); await fetch(`${host.url}/api/delegations/${first.delegation.id}`);
    assert.equal(notifications.length, 3);
    const current = store.get(owner, first.delegation.id);
    assert.equal((await post(path, { kind: 'pause', expectedVersion: current.version, idempotencyKey: 'pause' })).status, 200);
    assert.equal(notifications.length, 3);
  } finally { await host.close(); store.close(); }
});

test('follow-up notification failures or pending work do not turn a committed goal into an HTTP save failure', async () => {
  for (const mode of ['throws', 'rejects', 'pending']) {
    const store = new SentiStore({ filename: ':memory:' });
    const host = await startLocalHost({ allowUnauthenticated: true,  store, owner, researchPort: {
      status: { status: 'sdk_ready', message: '合成异步通知边界' }, detail: () => ({}),
      changed() {
        if (mode === 'throws') throw new Error('synthetic follow-up failure');
        if (mode === 'rejects') return Promise.reject(new Error('synthetic async follow-up failure'));
        return new Promise<void>(() => {});
      },
    } });
    try {
      const response = await fetch(`${host.url}/api/delegations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(2000),
        body: JSON.stringify({ goal: `saved despite ${mode}`, idempotencyKey: mode }),
      });
      assert.equal(response.status, 201);
      const created = await response.json() as { delegation: { id: string; research: unknown } };
      assert.deepEqual(created.delegation.research, { status: 'not_started', reason: 'runtime_unavailable' });
      const detail = await (await fetch(`${host.url}/api/delegations/${created.delegation.id}`)).json() as { delegation: { goal: string } };
      assert.equal(detail.delegation.goal, `saved despite ${mode}`);
    } finally { await host.close(); store.close(); }
  }
});
