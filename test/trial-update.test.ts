import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, chmod, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const updateModule = await import(new URL('../scripts/trial-update.mjs', import.meta.url).href);
const execute = promisify(execFile);
const fixtureRoot = path.resolve('.local/trial-command-checks/update-tests');
await mkdir(fixtureRoot, { recursive: true });
type Fixture = {
  root: string;
  publisher: string;
  origin: string;
  npmPath: string;
  callsFile: string;
  api: http.Server;
  apiUrl: string;
  target: string;
  ciConclusion: 'success' | 'failure';
  stoppedChecks: () => number;
  options: () => Record<string, unknown>;
  publish: () => Promise<string>;
  cleanup: () => Promise<void>;
};
async function git(root: string, args: string[]) {
  return (await execute('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=OptraSentiScope test', '-c', 'user.email=synthetic@example.invalid', ...args], { cwd: root })).stdout.trim();
}
async function commit(root: string, file: string, value: string) {
  await writeFile(path.join(root, file), value);
  await git(root, ['add', file]);
  await git(root, ['commit', '-m', value]);
}
async function fixture(): Promise<Fixture> {
  const base = await mkdtemp(path.join(fixtureRoot, 'run-'));
  const root = path.join(base, 'root'), publisher = path.join(base, 'publisher'), origin = path.join(base, 'origin.git');
  for (const directory of [root, publisher]) await mkdir(directory, { recursive: true });
  await git(root, ['init', '--initial-branch=main']);
  await commit(root, 'source.txt', 'from');
  await execute('git', ['clone', '--bare', root, origin]);
  await git(root, ['remote', 'add', 'origin', origin]);
  await git(root, ['push', '-u', 'origin', 'main']);
  await execute('git', ['clone', origin, publisher]);
  const target = await (async () => { await commit(publisher, 'source.txt', 'target'); await git(publisher, ['push', 'origin', 'main']); return git(publisher, ['rev-parse', 'HEAD']); })();
  const npmPath = path.join(base, 'fake-npm.sh'), callsFile = path.join(base, 'npm-calls.jsonl');
  await writeFile(npmPath, `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(callsFile)}\n`);
  await chmod(npmPath, 0o700);
  let stopped = 0;
  let ciConclusion: 'success' | 'failure' = 'success';
  const api = http.createServer((request, response) => {
    if (!request.url?.includes('/actions/workflows/check.yml/runs')) { response.statusCode = 404; response.end(); return; }
    const sha = new URL(request.url, 'http://127.0.0.1').searchParams.get('head_sha');
    const workflow_runs = sha === target ? [{ id: 1, name: 'Check', path: '.github/workflows/check.yml', head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: ciConclusion, repository: { full_name: 'gadfly-hbo/OptraSentiScope' }, head_repository: { full_name: 'gadfly-hbo/OptraSentiScope' } }] : [];
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ workflow_runs }));
  });
  await new Promise<void>(resolve => api.listen(0, '127.0.0.1', resolve));
  const address = api.address() as AddressInfo;
  const run = (workflow_runs: unknown[]) => ({ workflow_runs });
  const success = (sha: string) => ({ id: 1, name: 'Check', path: '.github/workflows/check.yml', head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', repository: { full_name: 'gadfly-hbo/OptraSentiScope' }, head_repository: { full_name: 'gadfly-hbo/OptraSentiScope' } });
  return {
    root, publisher, origin, npmPath, callsFile, api, apiUrl: `http://127.0.0.1:${address.port}`, target,
    get ciConclusion() { return ciConclusion; }, set ciConclusion(value) { ciConclusion = value; },
    stoppedChecks: () => stopped,
    options: () => ({ root, assertStopped: async () => { stopped += 1; }, expectedOrigin: origin, githubApiBase: `http://127.0.0.1:${address.port}`, npmPath }),
    publish: async () => {
      await commit(publisher, 'source.txt', `target-${Date.now()}-${Math.random()}`);
      await git(publisher, ['push', 'origin', 'main']);
      return git(publisher, ['rev-parse', 'HEAD']);
    },
    cleanup: async () => { await new Promise<void>(resolve => api.close(() => resolve())); await rm(base, { recursive: true, force: true }); },
  };
}

test('trial update errors keep user-facing diagnostic messages', () => {
  assert.equal(updateModule.trialUpdateMessages.trial_checkout_dirty.includes('本地改动'), true);
  assert.equal(updateModule.trialUpdateMessages.trial_ci_not_passed.includes('尚未通过'), true);
  assert.equal(updateModule.trialUpdateMessages.trial_sdk_prepare_failed.includes('官方 SDK 准备未完成'), true);
});

test('trial update fast-forwards only after main CI success, prepares dependencies and SDK, and rechecks stopped state', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  const result = await updateModule.updateTrialCheckout(f.options());
  assert.equal(result.updated, true);
  assert.equal(result.targetSha, f.target);
  assert.equal(await git(f.root, ['rev-parse', 'HEAD']), f.target);
  const calls = (await readFile(f.callsFile, 'utf8')).trim().split('\n');
  assert.deepEqual(calls, ['ci --ignore-scripts', 'run setup:sdk']);
  assert.equal(f.stoppedChecks() >= 2, true);
});

test('trial update rejects a dirty checkout before network or install work', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  await writeFile(path.join(f.root, 'local-change.txt'), 'preserve me');
  await assert.rejects(updateModule.updateTrialCheckout(f.options()), (error: Error & { code?: string }) => error.code === 'trial_checkout_dirty');
  assert.equal(await git(f.root, ['rev-parse', 'HEAD']) !== f.target, true);
  await assert.rejects(readFile(f.callsFile));
});

test('trial update rejects a target whose main push check did not succeed', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  f.ciConclusion = 'failure';
  await assert.rejects(updateModule.updateTrialCheckout(f.options()), (error: Error & { code?: string }) => error.code === 'trial_ci_not_passed');
  f.ciConclusion = 'success';
  assert.equal(await git(f.root, ['rev-parse', 'HEAD']) !== f.target, true);
  await assert.rejects(readFile(f.callsFile));
});

test('trial update rejects local ahead/diverged history and a non-official origin', async t => {
  const f = await fixture(); t.after(() => f.cleanup());
  await commit(f.root, 'local.txt', 'local-only');
  await assert.rejects(updateModule.updateTrialCheckout(f.options()), (error: Error & { code?: string }) => error.code === 'trial_local_ahead_or_diverged');
  await git(f.root, ['remote', 'set-url', 'origin', 'https://example.invalid/other.git']);
  await assert.rejects(updateModule.updateTrialCheckout(f.options()), (error: Error & { code?: string }) => error.code === 'trial_origin_mismatch');
  await assert.rejects(readFile(f.callsFile));
});
