import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);
export const OFFICIAL_ORIGIN = 'https://github.com/gadfly-hbo/OptraSentiScope.git';
export const trialUpdateMessages = {
  trial_git_failed: 'Git 操作未完成，现场已保留；请重试更新或反馈。',
  trial_checkout_required: '更新入口需要独立的产品 clone，请反馈部署问题。',
  trial_branch_not_main: '产品副本不在 main 分支，已停止更新；请反馈检查。',
  trial_checkout_dirty: '产品副本中有本地改动，已停止操作并保留现场；请反馈检查。',
  trial_origin_mismatch: '产品副本的远端地址不符合发布来源，已停止更新。',
  trial_git_operation_in_progress: '产品副本存在未完成的 Git 操作，已停止更新并保留现场。',
  trial_local_ahead_or_diverged: '产品副本与远端 main 无法安全快进，已停止更新并保留现场。',
  trial_target_invalid: '远端 main 目标提交无法核实，已停止更新并保留现场。',
  trial_ci_not_passed: '最新 main 的发布检查尚未通过，请稍后重试更新。',
  trial_ci_unavailable: '暂时无法核对 GitHub 发布检查，请稍后重试更新。',
  trial_ci_authenticated_unavailable: '无法通过本机 GitHub CLI 核对发布检查，请检查网络或 GitHub 登录状态后重试更新。',
  trial_ci_rate_limited: 'GitHub 匿名查询已限流。请在本机安装 GitHub CLI 并用 gh auth login 登录后重试更新。',
  trial_ci_endpoint_invalid: '发布检查查询地址无效，已停止更新。',
  trial_fetch_failed: '无法读取 GitHub 最新 main，请检查网络后重试。',
  trial_install_failed: '运行依赖安装未完成，现场已保留；请重试更新或反馈。',
  trial_sdk_prepare_failed: '官方 SDK 准备未完成，现场已保留；请重试更新或反馈。',
  trial_fast_forward_failed: '产品副本无法安全快进，已停止操作并保留现场。',
  trial_checkout_changed: '更新期间产品副本发生变化，已停止操作并保留现场。',
  trial_stopped_check_required: '更新流程缺少停止状态核对，已停止操作。',
};
export class TrialUpdateError extends Error {
  constructor(code) { super(code); this.name = 'TrialUpdateError'; this.code = code; }
}
function commandEnvironment() {
  const env = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'SYSTEMROOT']) if (process.env[key]) env[key] = process.env[key];
  env.NODE_OPTIONS = '--use-bundled-ca';
  env.PATH = path.dirname(process.execPath) + path.delimiter + (env.PATH ?? '/usr/bin:/bin');
  return env;
}
async function git(root, args, failure = 'trial_git_failed') {
  try { return (await exec('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { cwd: root, env: commandEnvironment(), maxBuffer: 4 * 1024 * 1024, timeout: 60_000 })).stdout.trim(); }
  catch { throw new TrialUpdateError(failure); }
}
async function checkout(root, expectedOrigin) {
  const stat = await fs.lstat(path.join(root, '.git')).catch(() => undefined);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new TrialUpdateError('trial_checkout_required');
  if (await git(root, ['rev-parse', '--show-toplevel']) !== await fs.realpath(root)) throw new TrialUpdateError('trial_checkout_required');
  if (await git(root, ['branch', '--show-current']) !== 'main') throw new TrialUpdateError('trial_branch_not_main');
  if (await git(root, ['status', '--porcelain=v1', '--untracked-files=all'])) throw new TrialUpdateError('trial_checkout_dirty');
  if (await git(root, ['remote', 'get-url', '--all', 'origin']) !== expectedOrigin) throw new TrialUpdateError('trial_origin_mismatch');
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const control = await git(root, ['rev-parse', '--git-path', name]);
    if (await fs.lstat(path.resolve(root, control)).then(() => true, () => false)) throw new TrialUpdateError('trial_git_operation_in_progress');
  }
  return git(root, ['rev-parse', 'HEAD']);
}
async function githubCliRuns(endpoint) {
  if (endpoint.origin !== 'https://api.github.com') return undefined;
  let stdout;
  try {
    ({ stdout } = await exec('gh', ['api', '--hostname', 'github.com', '--method', 'GET', '--header', 'accept: application/vnd.github+json', endpoint.pathname + endpoint.search], { env: { ...commandEnvironment(), GH_PROMPT_DISABLED: '1' }, maxBuffer: 4 * 1024 * 1024, timeout: 15_000 }));
  } catch (error) {
    if (!error.killed && (error.code === 'ENOENT' || error.code === 4)) return undefined;
    throw new TrialUpdateError('trial_ci_authenticated_unavailable');
  }
  try { return JSON.parse(stdout); }
  catch { throw new TrialUpdateError('trial_ci_authenticated_unavailable'); }
}
async function publicRuns(endpoint) {
  try {
    const response = await fetch(endpoint, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'OptraSentiScope-trial-updater' }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new TrialUpdateError('trial_ci_rate_limited');
    if (!response.ok) throw new Error('CI unavailable');
    const reader = response.body?.getReader(); if (!reader) throw new Error('CI response empty');
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength; if (size > 4 * 1024 * 1024) throw new Error('CI response oversized');
        chunks.push(Buffer.from(chunk.value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (error instanceof TrialUpdateError) throw error; throw new TrialUpdateError('trial_ci_unavailable'); }
}
async function successfulMainCheck(target, githubApiBase) {
  const endpoint = new URL('/repos/gadfly-hbo/OptraSentiScope/actions/workflows/check.yml/runs', githubApiBase);
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new TrialUpdateError('trial_ci_endpoint_invalid');
  endpoint.search = new URLSearchParams({ head_sha: target, event: 'push', branch: 'main', per_page: '100' }).toString();
  const authenticated = await githubCliRuns(endpoint);
  const payload = authenticated === undefined ? await publicRuns(endpoint) : authenticated;
  if (!payload || !Array.isArray(payload.workflow_runs)) throw new TrialUpdateError('trial_ci_unavailable');
  const matching = payload.workflow_runs.filter(run => run && Number.isSafeInteger(run.id) && run.id > 0 && run.name === 'Check' && run.path === '.github/workflows/check.yml' && run.head_sha === target && run.head_branch === 'main' && run.event === 'push' && run.repository?.full_name === 'gadfly-hbo/OptraSentiScope' && run.head_repository?.full_name === 'gadfly-hbo/OptraSentiScope');
  matching.sort((a, b) => b.id - a.id || (b.run_attempt ?? 1) - (a.run_attempt ?? 1));
  if (!matching.length || matching[0].status !== 'completed' || matching[0].conclusion !== 'success') throw new TrialUpdateError('trial_ci_not_passed');
}
async function npm(root, args, failure, npmPath = 'npm') {
  try { await exec(npmPath, args, { cwd: root, env: commandEnvironment(), maxBuffer: 4 * 1024 * 1024, timeout: 300_000 }); }
  catch { throw new TrialUpdateError(failure); }
}

// Caller holds the launcher operation lock throughout. assertStopped rechecks the owned instance/port.
export async function updateTrialCheckout(options) {
  const { root: inputRoot, assertStopped, expectedOrigin = OFFICIAL_ORIGIN, githubApiBase = 'https://api.github.com', npmPath } = options;
  if (typeof assertStopped !== 'function') throw new TrialUpdateError('trial_stopped_check_required');
  const root = path.resolve(inputRoot); await assertStopped(); const from = await checkout(root, expectedOrigin);
  await git(root, ['fetch', '--no-tags', 'origin', 'main'], 'trial_fetch_failed');
  const targetSha = await git(root, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
  if (!/^[a-f0-9]{40}$/.test(targetSha)) throw new TrialUpdateError('trial_target_invalid');
  const counts = (await git(root, ['rev-list', '--left-right', '--count', 'HEAD...' + targetSha])).split(/\s+/).map(Number);
  if (counts.length !== 2 || counts[0] !== 0) throw new TrialUpdateError('trial_local_ahead_or_diverged');
  await successfulMainCheck(targetSha, githubApiBase);
  await assertStopped();
  if (await checkout(root, expectedOrigin) !== from) throw new TrialUpdateError('trial_checkout_changed');
  await git(root, ['merge', '--ff-only', targetSha], 'trial_fast_forward_failed');
  if (await checkout(root, expectedOrigin) !== targetSha) throw new TrialUpdateError('trial_checkout_changed');
  await assertStopped();
  await npm(root, ['ci', '--ignore-scripts'], 'trial_install_failed', npmPath);
  await assertStopped();
  if (await checkout(root, expectedOrigin) !== targetSha) throw new TrialUpdateError('trial_checkout_changed');
  await npm(root, ['run', 'setup:sdk'], 'trial_sdk_prepare_failed', npmPath);
  if (await checkout(root, expectedOrigin) !== targetSha) throw new TrialUpdateError('trial_checkout_changed');
  return { updated: from !== targetSha, from, targetSha };
}
