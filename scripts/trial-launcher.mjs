import fs from 'node:fs/promises';
import { constants, readFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { trialUpdateMessages } from './trial-update.mjs';

const exec = promisify(execFile);
const rootDefault = fileURLToPath(new URL('../', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const messages = {
  trial_config_required: '未找到本机试用 Host 配置。请先完成本机配置；启动入口不会创建或修改配置。',
  invalid_trial_config: '本机试用 Host 配置无法安全读取，请保留配置并反馈。',
  port_in_use: 'OptraSentiScope 端口被其它服务占用，请先确认该服务；没有停止其它进程。',
  operation_busy: 'OptraSentiScope 正在启动、停止或更新，请稍后重试。',
  unsafe_control_file: 'OptraSentiScope 本机启动记录无法安全读取，请保留记录并反馈。',
  instance_identity_mismatch: '启动记录与当前进程身份不一致；没有发送停止信号，请反馈检查。',
  another_installation: '已有其它 OptraSentiScope 副本的启动记录，请先从原副本停止。',
  app_running: 'OptraSentiScope 尚在运行，请先使用停止入口再更新。',
  startup_failed: 'OptraSentiScope 未能正常启动，请查看启动日志并反馈。',
  updated_start_failed: '更新后的启动未完成；更新日志和新启动输出已保留，请反馈。',
  updated_start_output_invalid: '更新后的启动输出无法核对；更新日志已保留，请反馈。',
  stop_timeout: 'OptraSentiScope 未在正常退出时限内结束，启动记录和日志已保留。',
  runtime_required: 'OptraSentiScope 需要 Node.js 24.9 或更新版本。',
};
export class TrialLauncherError extends Error {
  constructor(code) { super(messages[code] ?? code); this.code = code; }
}
const fail = code => { throw new TrialLauncherError(code); };

export function trialOptions(input = {}) {
  const root = path.resolve(input.root ?? rootDefault);
  const config = path.resolve(input.config ?? path.join(root, '.local/service-trial-20261120/host.json'));
  const configDirectory = path.dirname(config);
  const options = {
    root,
    config,
    runtimeRoot: path.resolve(input.runtimeRoot ?? path.join(configDirectory, 'runtime')),
    stateRoot: path.resolve(input.stateRoot ?? path.join(configDirectory, 'launcher-state')),
    sdkRoot: path.resolve(input.sdkRoot ?? path.join(root, '.local/official-sdk')),
    nodePath: input.nodePath ?? process.execPath,
    openBrowser: input.openBrowser ?? true,
    startupTimeoutMs: input.startupTimeoutMs ?? 45_000,
    stopTimeoutMs: input.stopTimeoutMs ?? 20_000,
    lockTimeoutMs: input.lockTimeoutMs ?? 50_000,
  };
  let host;
  try { host = JSON.parse(readFileSync(options.config, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') fail('trial_config_required'); fail('invalid_trial_config'); }
  if (!host || typeof host !== 'object' || !Number.isSafeInteger(host.port) || host.port < 0 || host.port > 65535) fail('invalid_trial_config');
  options.port = host.port;
  return options;
}
async function directory(value) {
  await fs.mkdir(value, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(value); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe_control_file');
  await fs.chmod(value, 0o700);
}
async function readControl(file, { allowHardLink = false } = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let handle;
    try {
      handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat(); if (!stat.isFile() || stat.nlink > (allowHardLink ? 2 : 1) || stat.size > 65_536) fail('unsafe_control_file');
      if (stat.nlink === 0) continue;
      return { value: JSON.parse(await handle.readFile('utf8')), stat };
    } catch (error) { if (error.code === 'ENOENT') return null; if (error instanceof TrialLauncherError) throw error; fail('unsafe_control_file'); }
    finally { await handle?.close(); }
  }
  fail('unsafe_control_file');
}
async function writeControl(file, value) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}`);
  const handle = await fs.open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); } finally { await handle.close(); }
  try { await fs.rename(temp, file); }
  catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
}
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
async function recoverDeadLock(file) {
  const recovery = file + '.recovery';
  try { await fs.mkdir(recovery, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') return; throw error; }
  try {
    const current = await readControl(file, { allowHardLink: true });
    if (current && Number.isSafeInteger(current.value.pid) && typeof current.value.token === 'string' && !alive(current.value.pid)) await fs.unlink(file);
  } finally { await fs.rmdir(recovery); }
}
export async function withTrialOperationLock(input, operation) {
  const options = trialOptions(input); await directory(options.stateRoot);
  const file = path.join(options.stateRoot, 'operation.lock'), token = randomUUID(), deadline = Date.now() + options.lockTimeoutMs;
  for (;;) {
    const temp = path.join(options.stateRoot, `.operation.lock-${randomUUID()}`);
    try {
      const handle = await fs.open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token })); await handle.sync(); } finally { await handle.close(); }
      await fs.link(temp, file);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    } finally { await fs.unlink(temp).catch(() => {}); }
    let old;
    try { old = await readControl(file, { allowHardLink: true }); }
    catch (error) {
      const stat = await fs.lstat(file).catch(() => null);
      if (error.code === 'unsafe_control_file' && stat?.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= 4096 && Date.now() - stat.mtimeMs < 1000 && Date.now() < deadline) { await sleep(30); continue; }
      throw error;
    }
    if (!old) continue;
    if (!Number.isSafeInteger(old.value.pid) || typeof old.value.token !== 'string') fail('unsafe_control_file');
    if (!alive(old.value.pid)) {
      await recoverDeadLock(file);
      if (Date.now() > deadline) fail('operation_busy');
      await sleep(30); continue;
    }
    if (Date.now() > deadline) fail('operation_busy'); await sleep(30);
  }
  try { return await operation(options); }
  finally { const current = await readControl(file, { allowHardLink: true }); if (current?.value.pid === process.pid && current?.value.token === token) await fs.unlink(file); }
}
async function assertPortAvailable(port) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', error => reject(error.code === 'EADDRINUSE' ? new TrialLauncherError('port_in_use') : error)); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
async function health(port) {
  try { const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800), cache: 'no-store' }); return response.ok ? await response.json() : null; }
  catch { return null; }
}
function instanceArguments(options, instanceId) {
  return [
    path.join(options.root, 'scripts/runtime/start.mjs'),
    '--config', options.config, '--runtime-root', options.runtimeRoot, '--sdk-root', options.sdkRoot, '--instance-id', instanceId,
  ];
}
async function commandMatches(pid, options, instanceId) {
  if (!alive(pid)) return false;
  try {
    const { stdout } = await exec('ps', ['-p', String(pid), '-o', 'command=']);
    return instanceArguments(options, instanceId).every(argument => stdout.includes(argument));
  } catch { return false; }
}
async function currentInstance(options) {
  const saved = await readControl(path.join(options.stateRoot, 'instance.json')); if (!saved) return null;
  const value = saved.value;
  if (value.schema !== 1 || typeof value.instanceId !== 'string' || !Number.isSafeInteger(value.pid) || value.port !== options.port || value.config !== options.config || value.runtimeRoot !== options.runtimeRoot || value.sdkRoot !== options.sdkRoot) fail('unsafe_control_file');
  if (value.root !== options.root) fail('another_installation');
  if (!alive(value.pid)) return { saved, active: false };
  if (!await commandMatches(value.pid, options, value.instanceId)) fail('instance_identity_mismatch');
  return { saved, active: true, health: await health(value.port) };
}
async function removeInstance(options, instanceId) {
  const file = path.join(options.stateRoot, 'instance.json'), current = await readControl(file);
  if (current?.value.instanceId === instanceId) await fs.unlink(file);
}
async function showBrowser(options, url) {
  if (!options.openBrowser || process.platform !== 'darwin') return;
  await exec('/usr/bin/open', [url]).catch(() => {});
}
async function startUnlocked(options) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 9)) fail('runtime_required');
  const previous = await currentInstance(options);
  if (previous?.active) {
    if (!previous.health) fail('startup_failed');
    await showBrowser(options, previous.saved.value.url); return { status: 'already-running', pid: previous.saved.value.pid, instanceId: previous.saved.value.instanceId, url: previous.saved.value.url, logFile: previous.saved.value.logFile };
  }
  await assertPortAvailable(options.port);
  if (previous) await removeInstance(options, previous.saved.value.instanceId);
  await fs.mkdir(path.join(options.stateRoot, 'logs'), { recursive: true, mode: 0o700 });
  const instanceId = randomUUID(), url = `http://127.0.0.1:${options.port}/`, logFile = path.join(options.stateRoot, 'logs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${instanceId}.log`);
  const log = await fs.open(logFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  let child;
  try { child = spawn(options.nodePath, instanceArguments(options, instanceId), { cwd: options.root, detached: true, stdio: ['ignore', log.fd, log.fd], env: process.env }); }
  finally { await log.close(); }
  let spawnError; child.once('error', error => { spawnError = error; }); child.unref();
  const deadline = Date.now() + options.startupTimeoutMs; let status;
  while (Date.now() < deadline) {
    if (spawnError || child.exitCode !== null || child.signalCode !== null) break;
    status = await health(options.port);
    if (status?.status === 'ok') break;
    await sleep(100);
  }
  if (status?.status !== 'ok' || !await commandMatches(child.pid, options, instanceId)) {
    if (child.pid && await commandMatches(child.pid, options, instanceId)) child.kill('SIGTERM');
    fail('startup_failed');
  }
  const record = { schema: 1, pid: child.pid, instanceId, root: options.root, config: options.config, runtimeRoot: options.runtimeRoot, sdkRoot: options.sdkRoot, port: options.port, url, logFile, startedAt: new Date().toISOString() };
  await writeControl(path.join(options.stateRoot, 'instance.json'), record);
  await showBrowser(options, url);
  return { status: 'started', pid: record.pid, instanceId, url, logFile };
}
export async function startTrial(input = {}) { return withTrialOperationLock(input, startUnlocked); }
export async function stopTrial(input = {}) {
  return withTrialOperationLock(input, async options => {
    const current = await currentInstance(options);
    if (!current) return { status: 'not-running' };
    const record = current.saved.value;
    if (!current.active) { await removeInstance(options, record.instanceId); return { status: 'not-running' }; }
    process.kill(record.pid, 'SIGTERM');
    const deadline = Date.now() + options.stopTimeoutMs;
    while (Date.now() < deadline) {
      const owned = await commandMatches(record.pid, options, record.instanceId);
      const status = await health(record.port);
      if (!owned && !status) { await removeInstance(options, record.instanceId); return { status: 'stopped', instanceId: record.instanceId }; }
      await sleep(50);
    }
    fail('stop_timeout');
  });
}
export async function assertTrialStopped(input = {}) {
  const options = trialOptions(input), current = await currentInstance(options); if (current?.active) fail('app_running');
  await assertPortAvailable(options.port);
}
export async function updateAndStartTrial(input = {}) {
  const update = await withTrialOperationLock(input, async options => {
    await fs.mkdir(path.join(options.stateRoot, 'logs'), { recursive: true, mode: 0o700 });
    const logFile = path.join(options.stateRoot, 'logs', `${new Date().toISOString().replace(/[:.]/g, '-')}-update.log`);
    const log = await fs.open(logFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const record = async value => { await log.write(JSON.stringify(value) + '\n'); await log.sync(); };
    const recordBestEffort = async value => { await record(value).catch(() => {}); };
    try {
      await recordBestEffort({ event: 'update-started', at: new Date().toISOString(), root: options.root });
      const { updateTrialCheckout } = await import('./trial-update.mjs');
      const result = await updateTrialCheckout({ root: options.root, assertStopped: () => assertTrialStopped(options) });
      await recordBestEffort({ event: 'update-finished', at: new Date().toISOString(), result });
      return { ...result, logFile };
    } catch (error) {
      await recordBestEffort({ event: 'update-failed', at: new Date().toISOString(), code: error?.code ?? error?.name });
      throw error;
    } finally { await log.close(); }
  });
  const options = trialOptions(input), args = [path.join(options.root, 'scripts/trial-launcher.mjs'), 'start', ...cliIdentityArguments(options), '--json', ...(options.openBrowser ? [] : ['--no-open'])];
  let stdout;
  try { ({ stdout } = await exec(options.nodePath, args, { cwd: options.root, maxBuffer: 1_048_576, timeout: 120_000 })); }
  catch (error) {
    const log = await fs.open(update.logFile, 'a').catch(() => undefined);
    if (log) {
      await log.write(JSON.stringify({ event: 'post-update-start-failed', at: new Date().toISOString(), stderr: String(error?.stderr ?? '').trim() }) + '\n').catch(() => {});
      await log.close().catch(() => {});
    }
    fail('updated_start_failed');
  }
  try { return { ...JSON.parse(stdout.trim()), update }; }
  catch { fail('updated_start_output_invalid'); }
}
function cliIdentityArguments(options) {
  return [`--root=${options.root}`, `--config=${options.config}`, `--runtime-root=${options.runtimeRoot}`, `--state-root=${options.stateRoot}`, `--sdk-root=${options.sdkRoot}`];
}
async function main() {
  const [command, ...args] = process.argv.slice(2), values = new Map();
  for (const arg of args) {
    const index = arg.indexOf('='), name = index < 0 ? arg : arg.slice(0, index);
    if (!['--root', '--config', '--runtime-root', '--state-root', '--sdk-root', '--no-open', '--json'].includes(name)) throw new Error('Unknown trial argument.');
    values.set(name, index < 0 ? true : arg.slice(index + 1));
  }
  const input = { root: values.get('--root'), config: values.get('--config'), runtimeRoot: values.get('--runtime-root'), stateRoot: values.get('--state-root'), sdkRoot: values.get('--sdk-root'), openBrowser: !values.has('--no-open') };
  const action = { start: startTrial, stop: stopTrial, update: updateAndStartTrial }[command];
  if (!action) throw new Error('Use start, stop or update.');
  const result = await action(input);
  if (values.has('--json')) console.log(JSON.stringify(result));
  else if (result.status === 'stopped' || result.status === 'not-running') console.log('OptraSentiScope 已停止。');
  else console.log(`OptraSentiScope\n${result.url}\n日志：${result.logFile}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(messages[error?.code] ?? trialUpdateMessages[error?.code] ?? 'OptraSentiScope 操作未完成，请保留日志并反馈。'); process.exitCode = 1; });
