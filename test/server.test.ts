import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { SentiStore } from '../src/store.ts';
import { startLocalHost } from '../src/server.ts';
import type { ControlResult, LifecycleControlPort } from '../src/control.ts';
import type { Delegation } from '../src/domain.ts';

interface DetailResponse {
  delegation: Delegation;
  runtime: { status: string };
  research: unknown[];
  artifacts: unknown[];
}
async function detailJson(response: Response): Promise<DetailResponse> {
  return await response.json() as DetailResponse;
}

const owner = { enterpriseId: 'enterprise-a', principalId: 'operator-a' };
const testRoot = resolve('.local/tests');
mkdirSync(testRoot, { recursive: true });

test('a goal created through the workbench API survives a complete host restart without fabricated research', async () => {
  const directory = mkdtempSync(join(testRoot, 'http-reopen-'));
  const filename = join(directory, 'business.sqlite');
  let store = new SentiStore({ filename });
  let host = await startLocalHost({ store, owner });
  try {
    const response = await fetch(`${host.url}/api/delegations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: '持续关注协作中的变化', idempotencyKey: 'create-api-1' }),
    });
    assert.equal(response.status, 201);
    const created = await detailJson(response);
    assert.equal(created.delegation.goal, '持续关注协作中的变化');
    assert.equal(created.runtime.status, 'unconfigured');
    assert.deepEqual(created.research, []);
    assert.deepEqual(created.artifacts, []);
    await host.close(); store.close();
    store = new SentiStore({ filename });
    host = await startLocalHost({ store, owner });
    const reopened = await detailJson(await fetch(`${host.url}/api/delegations/${created.delegation.id}`));
    assert.equal(reopened.delegation.goal, '持续关注协作中的变化');
    assert.equal(reopened.delegation.id, created.delegation.id);
    assert.deepEqual(reopened.delegation.research, { status: 'not_started', reason: 'runtime_unavailable' });
  } finally {
    await host.close(); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test('cross-site requests and browser-supplied identity cannot read or create enterprise records', async () => {
  const store = new SentiStore({ filename: ':memory:' });
  const host = await startLocalHost({ store, owner });
  try {
    const foreign = await fetch(`${host.url}/api/delegations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
      body: JSON.stringify({ goal: '不应创建', idempotencyKey: 'foreign-origin' }),
    });
    assert.equal(foreign.status, 403);
    const spoofed = await fetch(`${host.url}/api/delegations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: host.url },
      body: JSON.stringify({ goal: '不应创建', idempotencyKey: 'spoof-owner', owner: { enterpriseId: 'other', principalId: 'admin' } }),
    });
    assert.equal(spoofed.status, 400);
    assert.equal((await fetch(`${host.url}/api/delegations`, { headers: { Origin: 'null' } })).status, 403);
    // Undici replaces Host/Sec-Fetch-*; send real HTTP headers for the rejection cases.
    assert.equal(await rawStatus(`${host.url}/api/delegations`, { Host: 'attacker.example' }), 403);
    assert.equal(await rawStatus(`${host.url}/api/delegations`, { 'Sec-Fetch-Site': 'cross-site' }), 403);
    const result = await (await fetch(`${host.url}/api/delegations`)).json() as { delegations: Delegation[] };
    assert.deepEqual(result.delegations, []);
  } finally { await host.close(); store.close(); }
});

function rawStatus(url: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { headers }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    req.on('error', reject); req.end();
  });
}

test('pause stays in flight until a Host receipt, and duplicate HTTP intent does not dispatch twice', async () => {
  const store = new SentiStore({ filename: ':memory:' });
  let settle!: (result: ControlResult) => void;
  let calls = 0;
  const port: LifecycleControlPort = {
    status: { status: 'test_boundary', message: '合成外部资源回执边界，不是SDK验证' },
    async settle() { calls += 1; return new Promise((resolve) => { settle = resolve; }); },
  };
  const host = await startLocalHost({ store, owner, controlPort: port });
  try {
    const created = await detailJson(await fetch(`${host.url}/api/delegations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: '持续跟进', idempotencyKey: 'create-control' }),
    }));
    const path = `${host.url}/api/delegations/${created.delegation.id}/commands`;
    const payload = JSON.stringify({ kind: 'pause', expectedVersion: 1, idempotencyKey: 'pause-one' });
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    assert.equal(response.status, 200);
    assert.equal((await detailJson(response)).delegation.lifecycle, 'pausing');
    const repeated = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    assert.equal(repeated.status, 200);
    assert.equal(calls, 1);
    settle({ outcome: 'stopped', evidence: '合成边界已实际释放其全部资源' });
    let lifecycle = '';
    for (let n = 0; n < 20; n += 1) {
      const detail = await detailJson(await fetch(`${host.url}/api/delegations/${created.delegation.id}`));
      lifecycle = detail.delegation.lifecycle;
      if (lifecycle === 'paused') break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(lifecycle, 'paused');
  } finally { await host.close(); store.close(); }
});

test('the real workbench is served with a restrictive CSP and private source files are not exposed', async () => {
  const store = new SentiStore({ filename: ':memory:' });
  const host = await startLocalHost({ store, owner });
  try {
    const page = await fetch(host.url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /经营者工作台/);
    assert.match(html, /持续做出更好的决策/);
    assert.doesNotMatch(html, /演示情境|DEMO-SRC|模拟停止回执/);
    assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.equal((await fetch(`${host.url}/app.js`)).status, 200);
    assert.equal((await fetch(`${host.url}/styles.css`)).status, 200);
    assert.equal((await fetch(`${host.url}/.local/product/business.sqlite`)).status, 404);
    assert.equal((await fetch(`${host.url}/src/store.ts`)).status, 404);
    assert.equal((await fetch(`${host.url}/package.json`)).status, 404);
  } finally { await host.close(); store.close(); }
});

test('a second Host cannot reconcile a database still owned by a live Host', async () => {
  const directory = mkdtempSync(join(testRoot, 'single-host-'));
  const filename = join(directory, 'business.sqlite');
  const store = new SentiStore({ filename });
  const secondStore = new SentiStore({ filename });
  const first = await startLocalHost({ store, owner });
  let second: Awaited<ReturnType<typeof startLocalHost>> | undefined;
  try {
    await assert.rejects(async () => { second = await startLocalHost({ store: secondStore, owner }); }, /Host|占用/);
    assert.equal((await fetch(`${first.url}/api/health`)).status, 200);
  } finally { if (second) await second.close(); await first.close(); secondStore.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('a new process can take over a dead Host lease and read the committed goal', { timeout: 10000 }, async () => {
  const directory = mkdtempSync(join(testRoot, 'dead-host-'));
  const filename = join(directory, 'business.sqlite');
  const program = `import {SentiStore} from ${JSON.stringify(pathToFileURL(resolve('src/store.ts')).href)};
    import {startLocalHost} from ${JSON.stringify(pathToFileURL(resolve('src/server.ts')).href)};
    const store=new SentiStore({filename:${JSON.stringify(filename)}});
    const host=await startLocalHost({store,owner:${JSON.stringify(owner)}});
    process.stdout.write(host.url+'\\n');`;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', program], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let next: Awaited<ReturnType<typeof startLocalHost>> | undefined;
  let store: SentiStore | undefined;
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let text = '';
      child.stdout.on('data', (chunk: Buffer) => { text += chunk.toString(); if (text.includes('\n')) resolve(text.split('\n')[0]); });
      child.once('error', reject); child.stderr.on('data', (chunk: Buffer) => reject(new Error(chunk.toString())));
    });
    const saved = await detailJson(await fetch(`${url}/api/delegations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: '异常退出前已提交的持续目标', idempotencyKey: 'before-process-exit' }),
    }));
    child.kill('SIGKILL'); await exited;
    store = new SentiStore({ filename }); next = await startLocalHost({ store, owner });
    const restored = await detailJson(await fetch(`${next.url}/api/delegations/${saved.delegation.id}`));
    assert.equal(restored.delegation.goal, '异常退出前已提交的持续目标');
    assert.equal(restored.runtime.status, 'unconfigured');
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    if (next) await next.close(); store?.close(); rmSync(directory, { recursive: true, force: true });
  }
});
