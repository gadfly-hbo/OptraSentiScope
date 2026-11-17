import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

export const name = 'sentiscope-sdk-native-check';
// This engineering composition waits for the shipped driver factory to be ready.
export const inject = ['agents', 'agentLoop', 'sessions', 'sessionPersistence', 'schedule', 'llm'];

async function history(ctx, id) {
  const reader = await ctx.sessionPersistence.open(id, 'read');
  try { return (await reader.read()).events; }
  finally { await reader.close(); }
}

function containsInput(events, messageId) {
  return events.some(event => event.type === 'agent/inbox/spliced' && (event.data.inserted ?? []).some(message => message.id === messageId));
}

export async function apply(ctx, config) {
  assert.equal(typeof config.output, 'string');
  assert.ok(['create', 'cold'].includes(config.phase));
  const report = { status: 'FAIL', scope: 'Real idle Agent/JSONL and disabled Schedule only', checks: [], phase: config.phase };
  let handle;
  try {
    assert.deepEqual(ctx.llm.listProviders(), []);
    if (config.phase === 'cold') {
      const prior = JSON.parse(readFileSync(config.prior, 'utf8'));
      assert.equal(prior.status, 'PASS');
      const row = await ctx.schedule.view({ id: prior.scheduleId });
      assert.equal(row.status, 'paused');
      handle = await ctx.agents.resume({ resumeSessionId: SessionId(prior.sessionId) });
      assert.ok(containsInput(await history(ctx, handle.agent.id), prior.messageId));
      Object.assign(report, { sessionId: prior.sessionId, scheduleId: prior.scheduleId, messageId: prior.messageId });
      report.checks.push('Fresh Host process reads paused Schedule and resumes exact persisted Session/input history');
    } else {
      const id = SessionId(`sentiscope-sdk-check-${randomUUID()}`);
      let commits = 0;
      handle = await ctx.agents.create({ sessionId: id, setup: () => ({ commit() { commits += 1; } }) });
      assert.equal(commits, 1);
      assert.equal(handle.agent.status, 'idle');
      const input = createUserMessage({ content: [{ type: 'text', text: 'Engineering persistence fixture; never wake a model.' }], source: { kind: 'user' } });
      handle.agent.inject(input);
      assert.equal(await ctx.sessions.flush(handle.agent.session), true);
      assert.ok(containsInput(await history(ctx, id), input.id));
      report.checks.push('Create/setup commit; inject without wake; Session flush and public persistence reader');
      handle.agent.cancel({ kind: 'user' }, { keepInbox: true });
      await handle.agent.whenIdle();
      await handle.dispose(); handle = undefined;
      assert.equal(ctx.agents.get(id), undefined);
      handle = await ctx.agents.resume({ resumeSessionId: id });
      assert.equal(handle.agent.id, id);
      assert.ok(containsInput(await history(ctx, id), input.id));
      report.checks.push('Idle cancel/whenIdle/dispose; owned registry entry removed; exact Session resumes');
      const row = await ctx.schedule.create({ title: 'Engineering future check', prompt: 'Synthetic fixture; disabled before it becomes due.', timing: { kind: 'after', after_seconds: 3600 }, target: { kind: 'session', sessionId: id } }, id);
      const paused = await ctx.schedule.edit({ id: row.id, action: 'update', patch: { active: false } }, id);
      assert.equal(paused.status, 'paused');
      assert.equal((await ctx.schedule.view({ id: row.id })).status, 'paused');
      Object.assign(report, { sessionId: id, scheduleId: row.id, messageId: input.id });
      report.checks.push('Real Schedule created and disabled; saved view is paused');
    }
    report.modelSteps = (await history(ctx, handle.agent.id)).filter(event => event.type === 'step/start').length;
    assert.equal(report.modelSteps, 0);
    handle.agent.cancel({ kind: 'user' }, { keepInbox: true });
    await handle.agent.whenIdle();
    await handle.dispose(); handle = undefined;
    report.checks.push('Native idle lifecycle closed; no provider registered or model step');
    report.status = 'PASS';
  } catch (error) {
    report.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (handle) {
      try { await handle.dispose(); }
      catch (error) { report.status = 'FAIL'; report.cleanupError = error.message; }
    }
  }
  writeFileSync(config.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
}
