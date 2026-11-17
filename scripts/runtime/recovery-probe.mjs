import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { startProductHost } from 'sentiscope-runtime/plugin';
import { Synthetic } from './engineering-probe.mjs';

export const name = 'sentiscope-product-cold-recovery-check';
export const inject = ['agents', 'agentLoop', 'sessions', 'sessionPersistence', 'schedule', 'llm', 'tools', 'credentials'];
const owner = { enterpriseId: 'recovery-engineering', principalId: 'synthetic-operator' };
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const pause = milliseconds => new Promise(accept => setTimeout(accept, milliseconds));
async function wait(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await pause(30); }
  throw new Error(`Timed out: ${label}`);
}
function runs(store, id) {
  const rows = store.connection.prepare('SELECT value FROM research_runs WHERE delegation_id=? ORDER BY generation').all(id).map(row => JSON.parse(row.value));
  return [...new Map(rows.map(row => [row.key, row])).values()];
}
async function nativeSnapshot(ctx, store, id) {
  const snapshot = [];
  for (const run of runs(store, id)) {
    const agent = ctx.agents.get(run.sessionId);
    assert.ok(agent, `Owned native Agent exists: ${run.sessionId}`);
    await agent.whenIdle();
    assert.equal(await ctx.sessions.flush(agent.session), true);
    const reader = await ctx.sessionPersistence.open(run.sessionId, 'read');
    try {
      const { events } = await reader.read();
      assert.ok(events.some(event => event.type === 'turn/end'), 'Native turn is persisted');
      snapshot.push({ ...run, nativeEventCount: events.length });
    } finally { await reader.close(); }
  }
  return snapshot;
}

/** An isolated engineering fixture. Synthetic Provider, source root and fault admission never enter product defaults. */
export async function apply(ctx, config) {
  const result = { status: 'FAIL', phase: config.phase, pid: process.pid, scope: 'Isolated product Host OS-process crash/recovery; local synthetic Provider and empty explicit source only; no research-quality or POC claim', checks: [] };
  let host;
  let keepRunning = false;
  try {
    assert.ok(['first', 'cold'].includes(config.phase));
    const { EngineStore } = await import(pathToFileURL(resolve(config.project, 'src/engine-store.ts')).href);
    const prior = config.phase === 'cold' ? JSON.parse(readFileSync(config.prior, 'utf8')) : undefined;
    if (prior) assert.equal(prior.status, 'READY');
    const adapter = new Synthetic();
    ctx.llm.registerAdapter(['sentiscope-recovery-engineering-only'], adapter);
    const grant = prior?.grant ?? { sourceId: 'recovery-empty-fixture', directory: mkdtempSync(resolve(tmpdir(), 'sentiscope-recovery-')), grantRevision: 1, enabled: true };
    assert.ok(existsSync(grant.directory), 'Cold phase reuses the original independent source root; it never recreates a missing grant target');
    host = await startProductHost(ctx, {
      dataDirectory: resolve(config.root, 'data'), owner, port: 0,
      model: { provider: 'sentiscope-recovery-engineering-only', model: 'local-synthetic', maxTokens: 64 }, intervalSeconds:60,notificationDefaults:{timeZone:'UTC',time:'23:59:59',weekdays:[1,2,3,4,5]},
      resourceDefaults: { budget: { limits: { modelRequests: 1000, outputTokens: 1000000, computeMilliseconds: 0 }, durationMs: 3600000 }, modelEgress: { enabled: true, provider: 'sentiscope-recovery-engineering-only', model: 'local-synthetic', maxTokens: 64 } },
      ...(prior ? { grants: { [prior.delegationId]: [prior.grant] } } : {}),
    }, { localModelRoutes: [{ provider: 'sentiscope-recovery-engineering-only', model: 'local-synthetic' }] });
    const request = async (path, body) => {
      const response = await fetch(host.url + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      const value = await response.json();
      assert.ok(response.ok, JSON.stringify(value));
      return value;
    };
    if (config.phase === 'first') {
      const created = await request('/api/delegations', { goal: 'Engineering cold-recovery fixture; continuously follow an empty approved source.', boundary: 'Only isolated synthetic engineering resources; no business decisions or actions.', idempotencyKey: 'recovery-create' });
      const id = created.delegation.id;
      host.coordinator.configureSources(id, [grant]);
      await host.coordinator.sync(id);
      await wait(() => { const detail = host.coordinator.detail(id); return detail.research.length > 0 && detail.artifacts.length > 0; }, 'real Engine ticket and saved synthetic waiting report');
      await host.coordinator.sync(id);
      const snapshot = await nativeSnapshot(ctx, host.store, id);
      assert.ok(snapshot.some(run => run.binding.role === 'main'));
      assert.ok(snapshot.some(run => run.binding.role === 'worker'));
      assert.ok(snapshot.every(run => run.state === 'current'));
      const schedules = [];
      for (const run of snapshot) for (const scheduleId of run.schedules) {
        const row = await ctx.schedule.view({ id: scheduleId });
        assert.equal(row.status, 'active');
        assert.equal(row.target.sessionId, run.sessionId);
        schedules.push(row);
      }
      assert.equal(schedules.length, 2, 'Exactly the owned research heartbeat and workday brief must persist');
      assert.equal(schedules.filter(row => row.kind === 'every').length, 1);
      const weekly = schedules.filter(row => row.kind === 'weekly');
      assert.equal(weekly.length, 1);
      assert.equal(weekly[0].time, '23:59:59.000');
      assert.equal(weekly[0].timeZone, 'UTC');
      assert.deepEqual(weekly[0].weekdays, [1, 2, 3, 4, 5]);
      const detail = await request(`/api/delegations/${id}`);
      const resourceBudget = host.controls.budget(id).snapshot();
      assert.ok(resourceBudget.used.modelRequests > 0);
      assert.ok(resourceBudget.used.outputTokens > 0);
      assert.equal(resourceBudget.config.limits.computeMilliseconds, 0);
      assert.equal(detail.sources.find(source => source.sourceId === grant.sourceId)?.status, 'ready');
      assert.ok(detail.artifacts.every(artifact => artifact.evidence.length === 0));
      const engineStore = new EngineStore(host.store, { owner, delegationId: id });
      assert.equal(engineStore.listPending().length, 0, 'All ordinary actual Engine effects have settled');
      // Deliberately exercise only the public persistence port. This is not a received event,
      // official Engine evaluation, completed assessment, or real native delivery.
      const evalId = `engineering-unconfirmed-${randomUUID()}`;
      const thread = engineStore.repo.threads.list()[0];
      assert.ok(thread);
      engineStore.assessor.request({ evalId, thread, triggers: [{ id: `technical-fault-${randomUUID()}`, source: 'engineering-fault-injection', threads: [thread.ref], actor: { source: 'engineering', id: 'synthetic-fixture' }, human: false, at: new Date().toISOString(), text: 'Technical uncertain port-admission fixture; never an accepted product evaluation.', meta: { syntheticFault: true } }], strength: 'inferred', policyVersion: String(detail.delegation.goalRevision) , tickets: [] });
      const pending = engineStore.listPending().find(intent => intent.key === evalId);
      assert.ok(pending);
      const uncertain = engineStore.claim(pending.id);
      assert.equal(uncertain.state, 'claimed');
      assert.equal(host.store.connection.prepare('SELECT COUNT(*) AS count FROM research_messages WHERE intent_id=?').get(uncertain.id).count, 0);
      assert.equal(host.store.connection.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      result.checks.push('HTTP create produced actual official Engine ticket/Assignment and saved synthetic waiting report; exact owned Sessions and recurring Schedule persisted');
      result.checks.push('Explicit technical assessor-port fault was claimed without native delivery; it is labeled uncertain and must never be blindly replayed');
      Object.assign(result, { status: 'READY', delegationId: id, grant, resourceBudget, runs: snapshot, schedules, tickets: detail.research, artifacts: detail.artifacts, uncertainIntent: uncertain, requests: adapter.calls, url: host.url });
      save(config.output, result);
      keepRunning = true;
      // Driver must SIGKILL this spawned Host. No graceful product cleanup precedes the crash.
      await new Promise(() => {});
    } else {
      const id = prior.delegationId;
      assert.notEqual(process.pid, prior.pid);
      assert.equal(host.store.connection.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      const restoredBudget = host.controls.budget(id).snapshot();
      assert.deepEqual(restoredBudget.config, prior.resourceBudget.config, 'Cold defaults do not replace the original budget revision/limits/deadline');
      assert.ok(restoredBudget.used.modelRequests >= prior.resourceBudget.used.modelRequests, 'Cold restart never resets previously settled request usage');
      assert.ok(restoredBudget.used.outputTokens >= prior.resourceBudget.used.outputTokens, 'Cold restart never resets previously settled token usage');
      const restored = runs(host.store, id);
      for (const original of prior.runs) {
        const current = restored.find(run => run.key === original.key);
        assert.ok(current);
        assert.equal(current.sessionId, original.sessionId, 'Same exact official persisted Session resumes');
        assert.ok(current.binding.generation > original.binding.generation, 'Host qualifications use a fresh handle generation');
        assert.deepEqual(current.schedules, original.schedules);
        assert.equal(current.binding.epoch, original.binding.epoch, 'Identical explicit grant does not rotate source qualification');
        const reader = await ctx.sessionPersistence.open(current.sessionId, 'read');
        try { assert.ok((await reader.read()).events.length >= original.nativeEventCount); }
        finally { await reader.close(); }
      }
      let detail = await request(`/api/delegations/${id}`);
      assert.equal(detail.sources.find(source => source.sourceId === grant.sourceId)?.status, 'ready');
      const resumedFacts = detail.technical.filter(fact => fact.kind === 'native_resumed');
      for (const original of prior.runs) assert.ok(resumedFacts.some(fact => fact.detail.role === original.binding.role && fact.detail.generation > original.binding.generation));
      for (const ticket of prior.tickets) assert.ok(detail.research.some(row => row.id === ticket.id));
      for (const artifact of prior.artifacts) assert.deepEqual(detail.artifacts.find(row => row.id === artifact.id), artifact);
      const engineStore = new EngineStore(host.store, { owner, delegationId: id });
      assert.equal(engineStore.get(prior.uncertainIntent.id).state, 'claimed');
      assert.equal(host.store.connection.prepare('SELECT COUNT(*) AS count FROM research_messages WHERE intent_id=?').get(prior.uncertainIntent.id).count, 0);
      result.checks.push('New OS process resumes exact original main/worker Sessions with higher generations; SQLite tickets/reports and identical source-grant epoch survive the forced crash');
      result.checks.push('Synthetic uncertain claimed effect remains claimed, has no fabricated native delivery and is not reset for replay');
      const initialArtifacts = detail.artifacts.length;
      const initialRequests = adapter.calls.length;
      const dueStart = Date.now();
      await wait(() => host.coordinator.detail(id).artifacts.length > initialArtifacts, 'actual persisted native recurring Schedule continues research after cold restart', 80000);
      await wait(async () => (await ctx.schedule.view({ id: prior.schedules.find(row => row.kind === 'every').id })).lastDelivery, 'native research heartbeat persisted delivery receipt', 5000);
      assert.ok(adapter.calls.length > initialRequests);
      detail = await request(`/api/delegations/${id}`);
      assert.ok(detail.technical.some(fact => fact.kind === 'native_read' && fact.detail.generation > prior.runs.find(run => run.binding.role === 'main').binding.generation));
      assert.equal(engineStore.get(prior.uncertainIntent.id).state, 'claimed');
      assert.equal(host.store.connection.prepare('SELECT COUNT(*) AS count FROM research_messages WHERE intent_id=?').get(prior.uncertainIntent.id).count, 0);
      result.checks.push('Original official recurring Schedule actually becomes due in the new process and drives Agent-chosen routing to the existing ticket and another saved synthetic report');
      result.dueWaitMilliseconds = Date.now() - dueStart;
      await request(`/api/delegations/${id}/commands`, { kind: 'pause', expectedVersion: detail.delegation.version, idempotencyKey: 'recovery-pause' });
      await wait(async () => (await request(`/api/delegations/${id}`)).delegation.lifecycle === 'paused', 'cold Host pause settlement');
      const pausedRequests = adapter.calls.length;
      await pause(1200);
      assert.equal(adapter.calls.length, pausedRequests);
      assert.ok(runs(host.store, id).every(run => run.state === 'retired'));
      for (const run of restored) assert.equal(ctx.agents.get(run.sessionId), undefined, 'Official Agent registry no longer holds the paused owned Session');
      for (const schedule of prior.schedules) assert.equal((await ctx.schedule.view({ id: schedule.id })).status, 'paused');
      detail = await request(`/api/delegations/${id}`);
      await request(`/api/delegations/${id}/commands`, { kind: 'end', expectedVersion: detail.delegation.version, idempotencyKey: 'recovery-end' });
      await wait(async () => (await request(`/api/delegations/${id}`)).delegation.lifecycle === 'ended', 'cold Host end settlement');
      const endedRequests = adapter.calls.length;
      await pause(1200);
      assert.equal(adapter.calls.length, endedRequests);
      result.checks.push('Recovered Host pause/end settle actual owned native resources; saved Schedule is paused and no extra synthetic request appears during bounded post-stop observation');
      Object.assign(result, { status: 'PASS', delegationId: id, firstPid: prior.pid, restoredRuns: restored, requests: adapter.calls, detail: await request(`/api/delegations/${id}`) });
    }
  } catch (error) {
    result.error = { message: error.message, stack: error.stack };
    if (host) result.debug = host.store.connection.prepare('SELECT kind,detail FROM research_facts ORDER BY seq').all();
  } finally {
    if (host && !keepRunning) { try { await host.close(); } catch (error) { result.status = 'FAIL'; result.cleanupError = error.message; } }
  }
  if (!keepRunning) save(config.output, result);
}
