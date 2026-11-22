import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const launcher = await import(new URL('../scripts/trial-launcher.mjs', import.meta.url).href);
const evidence = path.resolve('.local/trial-command-checks/launcher-tests');
const fixtureRoot = path.resolve('.local/trial-command-checks');
await mkdir(evidence, { recursive: true });
async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}
async function fixture() {
  const root = await mkdtemp(path.join(fixtureRoot, 'run-'));
  await mkdir(path.join(root, 'scripts/runtime'), { recursive: true });
  const runtime = path.join(root, 'scripts/runtime/start.mjs');
  await writeFile(runtime, `import http from 'node:http';
import { readFileSync } from 'node:fs';
const values = process.argv.slice(2); const args = new Map(); for (let index = 0; index < values.length; index += 2) args.set(values[index], values[index + 1]);
const host = JSON.parse(readFileSync(args.get('--config'), 'utf8'));
const server = http.createServer((request, response) => {
  if (request.url === '/api/health') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ status: 'ok' })); return; }
  response.statusCode = 404; response.end();
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
server.listen(host.port, '127.0.0.1');
`);
  const config = path.join(root, 'host.json'), port = await availablePort();
  await writeFile(config, JSON.stringify({ port }));
  const options = { root, config, runtimeRoot: path.join(root, 'runtime'), stateRoot: path.join(root, 'state'), sdkRoot: path.join(root, 'sdk'), openBrowser: false, startupTimeoutMs: 12000, stopTimeoutMs: 12000, lockTimeoutMs: 12000 };
  return { root, options, async cleanup() { await launcher.stopTrial(options).catch(() => {}); await rm(root, { recursive: true, force: true }); } };
}

test('trial start is idempotent under concurrent clicks and stop removes only the owned instance', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const attempts = await Promise.all([launcher.startTrial(f.options), launcher.startTrial(f.options), launcher.startTrial(f.options)]);
  assert.equal(attempts.filter(result => result.status === 'started').length, 1);
  assert.equal(attempts.filter(result => result.status === 'already-running').length, 2);
  assert.equal(new Set(attempts.map(result => result.pid)).size, 1);
  const health = await fetch(`http://127.0.0.1:${launcher.trialOptions(f.options).port}/api/health`);
  assert.equal(health.status, 200);
  const stopped = await launcher.stopTrial(f.options);
  assert.equal(stopped.status, 'stopped');
  await assert.rejects(fetch(`http://127.0.0.1:${launcher.trialOptions(f.options).port}/api/health`));
  assert.deepEqual(await launcher.stopTrial(f.options), { status: 'not-running' });
  const log = await readFile(attempts.find(result => result.status === 'started').logFile, 'utf8');
  assert.equal(log, '');
});

test('trial launcher refuses an occupied port without touching the other service', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const blocker = createServer();
  await new Promise<void>(resolve => blocker.listen(launcher.trialOptions(f.options).port, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => blocker.close(() => resolve())));
  await assert.rejects(launcher.startTrial(f.options), (error: Error & { code?: string }) => error.code === 'port_in_use');
  assert.deepEqual(await launcher.stopTrial(f.options), { status: 'not-running' });
});

test('trial operation lock tolerates the atomic hard-link publication window under stress', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const options = launcher.trialOptions(f.options);
  for (let round = 0; round < 3; round++) {
    await Promise.all(Array.from({ length: 24 }, () => launcher.withTrialOperationLock(options, async () => { await new Promise(resolve => setTimeout(resolve, 1)); })));
  }
  const files = await import('node:fs/promises').then(fs => fs.readdir(options.stateRoot));
  assert.equal(files.includes('operation.lock'), false);
  assert.equal(files.filter(name => name.startsWith('.operation.lock-')).length, 0);
});

test('trial update gate reports a running app and another installation is explicit', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const running = await launcher.startTrial(f.options);
  await assert.rejects(launcher.assertTrialStopped(f.options), (error: Error & { code?: string }) => error.code === 'app_running');
  await assert.equal((await fetch(`http://127.0.0.1:${launcher.trialOptions(f.options).port}/api/health`)).status, 200);
  assert.equal((await launcher.stopTrial(f.options)).status, 'stopped');
  const options = launcher.trialOptions(f.options);
  const record = { schema: 1, pid: process.pid, instanceId: 'other-install', root: path.join(f.root, 'other-root'), config: options.config, runtimeRoot: options.runtimeRoot, sdkRoot: options.sdkRoot, port: options.port, url: `http://127.0.0.1:${options.port}/`, logFile: path.join(options.stateRoot, 'unused.log'), startedAt: new Date().toISOString() };
  await writeFile(path.join(options.stateRoot, 'instance.json'), JSON.stringify(record) + '\n');
  await assert.rejects(launcher.stopTrial(f.options), (error: Error & { code?: string }) => error.code === 'another_installation');
  assert.equal(running.status, 'started');
});

test('trial stop refuses a live pid whose command identity does not match', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const options = launcher.trialOptions(f.options);
  const record = { schema: 1, pid: process.pid, instanceId: 'synthetic-instance', root: options.root, config: options.config, runtimeRoot: options.runtimeRoot, sdkRoot: options.sdkRoot, port: options.port, url: `http://127.0.0.1:${options.port}/`, logFile: path.join(options.stateRoot, 'unused.log'), startedAt: new Date().toISOString() };
  await mkdir(options.stateRoot, { recursive: true });
  await writeFile(path.join(options.stateRoot, 'instance.json'), JSON.stringify(record) + '\n');
  await assert.rejects(launcher.stopTrial(f.options), (error: Error & { code?: string }) => error.code === 'instance_identity_mismatch');
});

test('trial options fail closed on a missing or invalid host configuration', async () => {
  const root = await mkdtemp(path.join(fixtureRoot, 'invalid-'));
  try {
    assert.throws(() => launcher.trialOptions({ root, config: path.join(root, 'missing.json') }), (error: Error & { code?: string }) => error.code === 'trial_config_required');
    const config = path.join(root, 'host.json'); await writeFile(config, JSON.stringify({ port: '8766' }));
    assert.throws(() => launcher.trialOptions({ root, config }), (error: Error & { code?: string }) => error.code === 'invalid_trial_config');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('command files and shell entry are executable', async () => {
  for (const file of ['启动 OptraSentiScope.command', '停止 OptraSentiScope.command', '更新并启动 OptraSentiScope.command', 'scripts/trial-command.sh']) {
    const value = await stat(path.resolve(file));
    assert.equal((value.mode & 0o111) !== 0, true, file);
  }
});
