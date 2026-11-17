import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createNativeResearchPort } from 'sentiscope-runtime';
import { LlmAdapter, LlmError, ToolCallId } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'sentiscope-native-active-engineering';
export const inject = ['agents', 'agentLoop', 'sessions', 'sessionPersistence', 'schedule', 'llm', 'tools'];

class SyntheticAdapter extends LlmAdapter {
  calls = 0;
  enteredCancel;
  async *stream(options) {
    this.calls++;
    const latest = [...options.messages].reverse().find(message => message.role === 'user');
    const text = latest?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? '';
    if (text.includes('probe:error')) throw new LlmError('Engineering synthetic authentication failure; no credentials used.', 'AUTH');
    if (text.includes('probe:cancel')) {
      this.enteredCancel?.();
      await new Promise((resolve, reject) => {
        if (options.signal.aborted) return reject(options.signal.reason);
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
      return;
    }
    const last = options.messages.at(-1);
    if (text.includes('probe:tool') && last?.role !== 'tool') {
      const block = { type: 'tool-call', id: ToolCallId(`synthetic-${randomUUID()}`), name: 'read_approved_source', arguments: JSON.stringify({ reference: 'engineering-source' }) };
      yield { type: 'block-start', index: 0, blockType: 'tool-call' };
      yield { type: 'block-end', index: 0, block };
      yield { type: 'finish', reason: { kind: 'tool-calls' } };
      return;
    }
    const block = { type: 'text', text: 'Engineering synthetic transport result; no professional research claim.' };
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: block.text };
    yield { type: 'block-end', index: 0, block };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

export async function apply(ctx, config) {
  const report = { status: 'FAIL', scope: 'Official native Agent/tool loop/cancel/Schedule using only explicit local synthetic Provider', checks: [] };
  let port;
  try {
    const adapter = new SyntheticAdapter();
    ctx.llm.registerAdapter(['sentiscope-engineering-synthetic'], adapter);
    let allowed = true;
    let allowStep = true;
    let allowTool = true;
    let toolCalls = 0;
    const reads = [];
    const turns = [];
    const failures = [];
    const binding = { owner: { enterpriseId: 'synthetic-enterprise', principalId: 'synthetic-operator' }, delegationId: `synthetic-${randomUUID()}`, goalRevision: 1, role: 'main', epoch: 1, generation: 1 };
    const tool = defineTool({ name: 'read_approved_source', description: 'Read only one explicit engineering source.', parameters: { reference: { type: 'string' } }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, async execute(args, exec) { exec.signal.throwIfAborted(); assert.equal(args.reference, 'engineering-source'); toolCalls++; return 'synthetic source value'; } });
    const options = { tools: [tool], model: { provider: 'sentiscope-engineering-synthetic', model: 'local-fixture' }, admit: (_binding, phase) => allowed && (phase !== 'step' || allowStep) && (phase !== 'tool' || allowTool), onRead: fact => reads.push(fact), onTurn: fact => turns.push(fact), onFailure: fact => failures.push(fact) };
    let wakeScans = 0;
    port = createNativeResearchPort(ctx, { async beforeWake() { wakeScans++; } });
    const handle = await port.open(binding, options);
    const messageId = `stable-${randomUUID()}`;
    await handle.deliver({ id: messageId, text: 'probe:tool' });
    await handle.whenIdle();
    assert.equal(toolCalls, 1);
    assert.equal(adapter.calls, 2);
    assert.ok(reads.some(fact => fact.messageId === messageId));
    assert.ok(turns.some(fact => fact.end.data.reason.kind === 'completed' && fact.events.some(event => event.type === 'tool/result')));
    assert.equal(failures.length, 0);
    report.checks.push('Official Agent followup makes two real local adapter requests through native tool executor; claimed/read and persisted completed turn/tool facts verified');
    allowTool = false;
    await handle.deliver({ id: randomUUID(), text: 'probe:tool guarded' });
    await handle.whenIdle();
    assert.equal(toolCalls, 1);
    assert.ok(turns.at(-1).events.some(event => event.type === 'tool/result' && event.data.message.isError));
    assert.equal(failures.length, 0);
    allowTool = true;
    allowStep = false;
    const beforeRejectedStep = adapter.calls;
    const rejectedMessageId=randomUUID();
    await handle.deliver({ id: rejectedMessageId, text: 'probe:rejected-step' });
    await handle.whenIdle();
    assert.equal(adapter.calls, beforeRejectedStep);
    assert.equal(reads.some(f=>f.messageId===rejectedMessageId),false);
    assert.ok(!turns.at(-1).events.some(event => event.type === 'step/start'));
    assert.equal(failures.length, 0);
    allowStep = true;
    report.checks.push('Current tool authorization denies body execution; stale pre-step prevents model request; neither is fabricated as agent/error');
    const beforeDueReads=reads.length;
    const schedule = await handle.createSchedule({ title: 'Synthetic due event', prompt: 'probe:due', timing: { kind: 'after', after_seconds: 1 } });
    const deadline = Date.now() + 8000;
    while (reads.length===beforeDueReads && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    await handle.whenIdle();
    assert.ok(reads.length>beforeDueReads);
    assert.equal((await handle.listSchedules())[0].id, schedule.id);
    // Native whole-Agent idle is separate from the Schedule domain's persisted receipt.
    while (!(await handle.listSchedules())[0].lastDelivery && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok((await handle.listSchedules())[0].lastDelivery);
    assert.equal(wakeScans, 1);
    report.checks.push('Official Schedule actually becomes due, resolves owned Agent, durably delivers and drives a native model turn');
    await handle.deliver({ id: randomUUID(), text: 'probe:error' });
    await handle.whenIdle();
    assert.equal(failures.length, 1);
    assert.equal(turns.at(-1).end.data.reason.kind, 'error');
    report.checks.push('Actual synthetic Provider AUTH error is observed through official agent/error and persisted error turn without rewriting it');
    let cancelEntered;
    const entered = new Promise(resolve => { cancelEntered = resolve; });
    adapter.enteredCancel = cancelEntered;
    await handle.deliver({ id: `cancel-${randomUUID()}`, text: 'probe:cancel' });
    await entered;
    handle.cancel();
    await handle.whenIdle();
    assert.ok(turns.some(fact => fact.end.data.reason.kind === 'aborted'));
    await assert.rejects(handle.deliver({ id: randomUUID(), text: 'after cancellation' }), /NATIVE_ADMISSION_DENIED/);
    await handle.dispose();
    assert.equal(ctx.agents.get(handle.sessionId), undefined);
    const resumed = await port.open({ ...binding, generation: 2 }, { ...options, sessionId: handle.sessionId, resume: true, scheduleIds: [schedule.id] });
    assert.equal(resumed.sessionId, handle.sessionId);
    await resumed.disableSchedule(schedule.id);
    await resumed.dispose();
    report.checks.push('Active model cancellation reaches native aborted turn, closed handle rejects delivery, owned disposal unregisters Agent; exact persisted Session resumes with new generation');
    allowed = false;
    await assert.rejects(port.open(binding, options), /NATIVE_ADMISSION_DENIED/);
    report.modelRequests = adapter.calls;
    report.turns = turns.map(fact => ({ sessionId: fact.sessionId, generation: fact.binding.generation, reason: fact.end.data.reason.kind, seq: fact.end.seq }));
    report.status = 'PASS';
  } catch (error) { report.error = { name: error.name, message: error.message, stack: error.stack }; }
  finally { if (port) { try { await port.dispose(); } catch (error) { report.cleanupError = error.message; report.status = 'FAIL'; } } }
  writeFileSync(config.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
