import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Cordis from '@deepseek-ai/cordis';
import * as Agent from '@deepseek-ai/dsh-agent';
import * as Session from '@deepseek-ai/dsh-session';
import * as Llm from '@deepseek-ai/dsh-llm';
import * as Schemastery from '@deepseek-ai/schemastery';

export const name = 'sentiscope-sdk-root-check';

function packageIdentity(entry) {
  let dir = dirname(entry);
  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
      if (manifest.name) return { name: manifest.name, version: manifest.version, packageDir: dir };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Package identity missing: ${entry}`);
    dir = parent;
  }
}

export async function apply(ctx, config) {
  assert.equal(typeof config.output, 'string');
  assert.equal(typeof config.scratch, 'string');
  const report = { status: 'FAIL', scope: 'Public root, peer resolution and synthetic Engine contracts only', checks: [], peers: [] };
  try {
    const core = await import('dsh-superagent');
    assert.equal(typeof core.Engine, 'function');
    assert.equal(typeof core.MemoryRepositories, 'function');
    report.superagentEntry = fileURLToPath(import.meta.resolve('dsh-superagent'));
    const fromSuperagent = createRequire(report.superagentEntry);
    const modules = { '@deepseek-ai/cordis': Cordis, '@deepseek-ai/dsh-agent': Agent, '@deepseek-ai/dsh-session': Session, '@deepseek-ai/dsh-llm': Llm, '@deepseek-ai/schemastery': Schemastery };
    for (const [name, module] of Object.entries(modules)) {
      const consumerPath = fileURLToPath(import.meta.resolve(name));
      const sourcePath = fromSuperagent.resolve(name);
      const identity = packageIdentity(sourcePath);
      const resolved = await import(pathToFileURL(sourcePath).href);
      assert.equal(identity.version, name === '@deepseek-ai/cordis' ? '4.1.0' : name === '@deepseek-ai/schemastery' ? '3.19.0' : '0.2.2-rc.3');
      if (name === '@deepseek-ai/schemastery') {
        // Its official import/require conditions intentionally expose distinct modules.
        assert.equal(packageIdentity(consumerPath).packageDir, identity.packageDir);
        assert.equal(module.default.from(core.Config), core.Config);
        assert.equal(module.default.resolve({ stateDir: config.scratch }, core.Config, {})[0].stateDir, config.scratch);
      } else {
        assert.equal(consumerPath, sourcePath);
        assert.equal(module, resolved);
      }
      report.peers.push({ ...identity, consumerPath, sourcePath, sameNamespace: module === resolved, conditionalSchemaExports: name === '@deepseek-ai/schemastery' });
    }
    assert.ok(ctx instanceof Cordis.Context);
    report.checks.push('Public root loaded; runtime peers use Host modules; official Schema conditional exports remain distinct');

    const repo = new core.MemoryRepositories();
    const candidates = [];
    const starts = [];
    const engine = new core.Engine({
      repo,
      policy: () => ({ version: 'E1-synthetic-v1', paused: false, gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'addressed', addressed: 'direct', source: 'e1' } }), revalidate: () => true, admitsInferred: () => true, evalTimeoutMs: 60000 }),
      scope: { scope: () => ({ listened: true, observed: true }) },
      assessor: { request: candidate => candidates.push(candidate) },
      executor: { start: (ticket, assignment) => starts.push({ ticketId: ticket.id, assignmentId: assignment.id }), deliver() {}, stop() {} },
      outbox: { send() {}, status() { return undefined; }, withdraw() {} },
      now: () => '2026-11-16T00:00:00.000Z',
    });
    const trigger = { id: 'E1-fixture-1', source: 'e1', threads: [{ source: 'e1', id: 'fixture-thread' }], actor: { source: 'e1', id: 'synthetic' }, human: false, at: '2026-11-16T00:00:00.000Z', text: 'Engineering fixture only; no real data or autonomous business judgment.', meta: { synthetic: true } };
    engine.receive(trigger); engine.evaluateDue();
    assert.equal(candidates.length, 1);
    const decision = engine.decide(trigger.id, { kind: 'accept', evalId: candidates[0].evalId, title: 'E1 fixture', scope: 'synthetic only', reason: 'Engineering port contract' });
    assert.ok(decision.ticketId);
    assert.equal(starts.length, 1);
    engine.receive(trigger); engine.evaluateDue();
    assert.equal(repo.tickets.list().length, 1);
    report.checks.push('Original Engine receive/evaluate/decide/start; duplicate does not create another Ticket');
    report.engine = { ticketId: decision.ticketId, starts, ticketCount: repo.tickets.list().length };
    report.status = 'PASS';
  } catch (error) {
    report.error = { name: error.name, message: error.message, stack: error.stack };
  }
  writeFileSync(config.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
}
