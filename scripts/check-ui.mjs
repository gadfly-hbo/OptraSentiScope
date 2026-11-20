import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { SentiStore } from '../src/store.ts';
import { startLocalHost } from '../src/server.ts';

// Uses an already installed browser tool. No installs, real sources, SDK, or model configuration.
const exec = promisify(execFile);
const root = resolve('.local/ui-checks'); mkdirSync(root, { recursive: true });
const output = mkdtempSync(join(root, 'run-'));
const session = `sentiscope-ui-${randomUUID()}`;
const store = new SentiStore({ filename: join(output, 'business.sqlite') });
const host = await startLocalHost({ store, owner: { enterpriseId: 'ui-fixture', principalId: 'ui-fixture' } });
const commands = [];
let error;
async function browser(...args) {
  try {
    const result = await exec('agent-browser', ['--session', session, ...args], { timeout: 35000, maxBuffer: 2 * 1024 * 1024 });
    commands.push({ args, ...result, exitCode: 0 }); return result.stdout.trim();
  } catch (cause) {
    commands.push({ args, stdout: cause.stdout, stderr: cause.stderr, exitCode: cause.code, signal: cause.signal }); throw cause;
  }
}
async function click(selector) { await browser('scrollintoview', selector); await browser('click', selector); }
async function truth(expression) { assert.equal(await browser('eval', expression), 'true', expression); }
try {
  await browser('open', host.url);
  await browser('wait', '--fn', 'Boolean(document.querySelector("#screen [data-action=create]"))');
  await click('#screen .page-heading [data-action="create"]');
  await browser('fill', '#goal-input', '键盘交互回归用持续目标');
  await click('#create-form button[type="submit"]');
  await browser('wait', '--fn', 'Boolean(document.querySelector(".detail-heading"))');
  await browser('focus', '[data-action="edit"]');
  await browser('wait', '5500'); // Cross the real 5-second read-only projection refresh.
  await truth('document.activeElement.dataset.action === "edit"');
  await click('#tab-conversation');
  await browser('fill', '#message-input', '跨刷新仍保留输入与选择。');
  await browser('wait', '5500');
  await truth('document.activeElement.id === "message-input" && document.activeElement.value === "跨刷新仍保留输入与选择。"');
  await browser('focus', '#conversation-form button[type="submit"]');
  await browser('wait', '5500');
  await truth('document.activeElement.type === "submit" && document.activeElement.closest("form")?.id === "conversation-form"');
  await browser('set', 'viewport', '390', '844');
  await truth('document.documentElement.scrollWidth <= innerWidth');
  await browser('screenshot', join(output, 'mobile.png'));
  assert.equal(await browser('errors'), '');
} catch (cause) { error = { name: cause.name, message: cause.message }; }
finally {
  await browser('close').catch(() => {}); await host.close(); store.close();
  writeFileSync(join(output, 'result.json'), `${JSON.stringify({ status: error ? 'FAIL' : 'PASS', error, commands }, null, 2)}\n`);
}
console.log(`${error ? 'FAIL' : 'PASS'}: ${output}`);
if (error) process.exitCode = 1;
