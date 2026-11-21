import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, copyFileSync, symlinkSync, openSync, closeSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeBackup, verifyRuntimeBackup, restoreRuntimeBackup } from '../src/backup.ts';
import { DatabaseSync } from 'node:sqlite';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, '.local/recovery-checks', `run-${Date.now()}-${randomUUID()}`);
const home = resolve(root, 'home');
const legacyProject = process.env.SENTISCOPE_LEGACY_PROJECT ?? project;
const source = resolve(project, '.local/official-sdk/superagent');
const cli = resolve(project, '.local/official-sdk/harness/node_modules/@deepseek-ai/dsh/lib/bin.js');
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const delay = milliseconds => new Promise(accept => setTimeout(accept, milliseconds));
const sourceEventCount = path => { const db = new DatabaseSync(path, { readOnly: true }); try { return db.prepare('SELECT count(*) AS count FROM source_events').get().count; } finally { db.close(); } };
for (const phase of ['first', 'cold']) {
  const phaseProject = phase === 'first' ? legacyProject : project, runtime = resolve(phaseProject, 'runtime'), consumer = resolve(root, `consumer-${phase}`);
  mkdirSync(resolve(consumer, 'node_modules'), { recursive: true, mode: 0o700 });
  for (const file of ['recovery-probe.mjs', 'engineering-probe.mjs']) copyFileSync(resolve(phaseProject, 'scripts/runtime', file), resolve(consumer, file));
  for (const [name, target] of [['dsh-superagent', source], ['sentiscope-runtime', runtime]]) symlinkSync(target, resolve(consumer, 'node_modules', name));
  save(resolve(consumer, 'package.json'), { name: 'sentiscope-recovery-check', private: true, type: 'module', main: 'recovery-probe.mjs', peerDependencies: { '@deepseek-ai/dsh-llm': '0.2.2-rc.3' }, dependencies: { 'dsh-superagent': `link:${source}`, 'sentiscope-runtime': `link:${runtime}` } });
  const state = resolve(root, phase === 'first' ? 'data' : 'restored');
  const services = [
    ['credentials', 'dsh-credentials-local', { path: resolve(state, 'private/credentials.yaml'), watch: false }], ['llm', 'dsh-llm'], ['session', 'dsh-session'], ['projection', 'dsh-session-projection'], ['prompt', 'dsh-system-prompt'], ['tools', 'dsh-tools'], ['executor', 'dsh-tool-executor-native'], ['agent', 'dsh-agent'], ['loop', 'dsh-agent-loop'],
    ['persistence', 'dsh-session-persistence-jsonl', { root: resolve(state, 'sessions'), compression: 'none' }], ['storage', 'dsh-storage'], ['json', 'dsh-storage-json', { root: resolve(state, 'storage') }], ['domain', 'dsh-storage-domain', { backend: 'json' }], ['schedule', 'dsh-schedule'],
  ].map(([id, name, config]) => ({ id, name: `@deepseek-ai/${name}`, ...(config ? { config } : {}) }));
  const profile = resolve(home, 'profiles', phase);
  mkdirSync(resolve(profile, 'node_modules'), { recursive: true });
  for (const [name, target] of [['dsh-superagent', source], ['sentiscope-runtime', runtime], ['sentiscope-recovery-check', consumer]]) symlinkSync(target, resolve(profile, 'node_modules', name));
  save(resolve(profile, 'package.json'), { name: `sentiscope-recovery-${phase}`, private: true, type: 'module', dependencies: { 'dsh-superagent': `link:${source}`, 'sentiscope-runtime': `link:${runtime}`, 'sentiscope-recovery-check': `link:${consumer}` }, dsh: { profile: { bundles: [] } } });
  save(resolve(profile, 'cordis.patch.yml'), [{ insert: [...services, { id: 'probe', name: 'sentiscope-recovery-check', config: { phase, root, project: phaseProject, output: resolve(root, `${phase}-result.json`), prior: resolve(root, 'first-result.json') } }] }]);
}
const env = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
Object.assign(env, { CI: 'true', DSH_HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
let active;
async function start(phase) {
  const descriptors = [openSync(resolve(root, `${phase}.stdout`), 'wx', 0o600), openSync(resolve(root, `${phase}.stderr`), 'wx', 0o600)];
  const args = [cli, '--profile', phase];
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', ...descriptors] });
  const record = { phase, argv: [process.execPath, ...args], cwd: root, pid: child.pid, startedAt: new Date().toISOString() };
  const entry = { child, record, exited: false };
  entry.done = new Promise(accept => {
    child.once('error', error => { record.error = error.message; });
    child.once('close', (code, signal) => {
      Object.assign(record, { code, signal, endedAt: new Date().toISOString() });
      entry.exited = true;
      descriptors.forEach(closeSync);
      save(resolve(root, `${phase}-process.json`), record);
      accept(record);
    });
  });
  active = entry;
  return entry;
}
async function waitResult(entry, timeout) {
  const output = resolve(root, `${entry.record.phase}-result.json`);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (existsSync(output)) return JSON.parse(readFileSync(output, 'utf8'));
    if (entry.exited) throw new Error(`${entry.record.phase} process exited without a report`);
    await delay(50);
  }
  entry.record.timedOut = true;
  throw new Error(`${entry.record.phase} report timed out`);
}
const result = { status: 'FAIL', scope: 'Two isolated product Host OS processes, deliberate first SIGKILL, exact persisted state; synthetic engineering only', root, phases: [] };
try {
  const first = await start('first');
  const ready = await waitResult(first, 30000);
  assert.equal(ready.status, 'READY', JSON.stringify(ready.error));
  assert.equal(ready.pid, first.child.pid);
  assert.equal(first.exited, false);
  first.record.terminationRequested = { signal: 'SIGKILL', reason: 'Deliberate crash of this driver-owned engineering Host after persistence readiness', at: new Date().toISOString() };
  assert.equal(first.child.kill('SIGKILL'), true);
  const firstExit = await first.done;
  assert.equal(firstExit.signal, 'SIGKILL');
  assert.equal(firstExit.code, null);
  result.phases.push({ phase: 'first', status: 'READY_THEN_SIGKILL', process: firstExit, report: resolve(root, 'first-result.json') });
  const manifest = await createRuntimeBackup(resolve(root, 'data'), resolve(root, 'backup'));
  const verification = await verifyRuntimeBackup(resolve(root, 'backup'));
  assert.equal(verification.status, 'ok');
  await restoreRuntimeBackup(resolve(root, 'backup'), resolve(root, 'restored'));
  for (const name of ['business.sqlite', 'sessions', 'storage']) assert.equal(existsSync(resolve(root, 'restored', name)), true, `Restored runtime includes ${name}`);
  if (existsSync(resolve(root, 'data/private'))) assert.equal(existsSync(resolve(root, 'restored/private')), true, 'Existing private credential state is restored');
  const sourceEventsBeforeCold = sourceEventCount(resolve(root, 'restored/business.sqlite'));
  result.phases.push({ phase: 'backup-restore', status: 'PASS', manifest: resolve(root, 'backup/manifest.json'), files: manifest.files.length, restored: resolve(root, 'restored'), sourceEventsBeforeCold });
  const cold = await start('cold');
  const coldReport = await waitResult(cold, 110000);
  assert.equal(coldReport.status, 'PASS', JSON.stringify(coldReport.error));
  assert.equal(sourceEventCount(resolve(root, 'restored/business.sqlite')), sourceEventsBeforeCold, 'Cold recovery must not replay already received source events');
  const coldExit = await cold.done;
  assert.equal(coldExit.code, 0);
  assert.equal(coldExit.signal, null);
  assert.notEqual(coldExit.pid, firstExit.pid);
  result.phases.push({ phase: 'cold', status: 'PASS', process: coldExit, report: resolve(root, 'cold-result.json') });
  result.status = 'PASS';
} catch (error) { result.error = { message: error.message, stack: error.stack }; }
finally {
  if (active && !active.exited) { active.record.cleanupRequested = { signal: 'SIGKILL', at: new Date().toISOString() }; active.child.kill('SIGKILL'); await active.done; }
  save(resolve(root, 'result.json'), result);
}
console.log(`${result.status}: ${root}/result.json`);
if (result.status !== 'PASS') console.error(JSON.stringify({ error: result.error, phases: result.phases }, null, 2));
process.exitCode = result.status === 'PASS' ? 0 : 1;
