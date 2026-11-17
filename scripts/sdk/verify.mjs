import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import {
  closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync,
  realpathSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = dirname(fileURLToPath(import.meta.url));
const project = resolve(scripts, '../..');
const local = resolve(project, '.local');
const pinnedSource = '8c32a9dc5d72c033816c6a8110b37f40cf94fba4';
const expectedVersion = '0.2.2-rc.3';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

function inside(path, root) {
  const part = relative(root, path);
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

function privatePath(path) {
  const target = resolve(project, path);
  if (!inside(target, local)) throw new Error('SDK and output paths must be under this project\'s .local directory');
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const realProject = realpathSync(project);
  const realAncestor = realpathSync(ancestor);
  const realLocal = existsSync(local) ? realpathSync(local) : resolve(realProject, '.local');
  if (!inside(realLocal, realProject) || (ancestor !== project && realAncestor !== realLocal && !inside(realAncestor, realLocal))) {
    throw new Error('Private path resolves outside the project\'s .local directory');
  }
  return target;
}

function parseArgs(args) {
  let sdk = resolve(local, 'official-sdk');
  let output = resolve(local, 'sdk-checks', `run-${Date.now()}-${randomUUID()}`);
  while (args.length) {
    const key = args.shift();
    if (key === '--help') {
      console.log('node scripts/sdk/verify.mjs [--sdk-root .local/official-sdk] [--output .local/sdk-checks/new-run]');
      process.exit(0);
    }
    if (!['--sdk-root', '--output'].includes(key) || !args.length || args[0].startsWith('--')) {
      throw new Error(`Unknown option or missing value: ${key}`);
    }
    if (key === '--sdk-root') sdk = args.shift();
    else output = args.shift();
  }
  return { sdk: privatePath(sdk), output: privatePath(output) };
}

function environment(home) {
  const env = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return { ...env, CI: 'true', DSH_HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
}

function requireInstallation(sdk, env) {
  const cli = resolve(sdk, 'harness/node_modules/@deepseek-ai/dsh/lib/bin.js');
  const pnpm = resolve(sdk, 'toolchain/node_modules/pnpm/bin/pnpm.cjs');
  const source = resolve(sdk, 'superagent');
  for (const path of [cli, pnpm, resolve(source, 'lib/index.js'), resolve(source, 'lib/index.d.ts'), resolve(source, 'pnpm-lock.yaml')]) {
    if (!existsSync(path)) throw new Error(`Missing approved official SDK installation/build: ${path}`);
  }
  if (json(resolve(dirname(cli), '../package.json')).version !== expectedVersion) throw new Error('Harness version mismatch');
  if (json(resolve(dirname(pnpm), '../package.json')).version !== '11.7.0') throw new Error('Original pnpm version mismatch');
  if (json(resolve(source, 'package.json')).name !== 'dsh-superagent') throw new Error('superagent package mismatch');
  const git = args => spawnSync('git', ['-C', source, ...args], { encoding: 'utf8', env });
  const head = git(['rev-parse', 'HEAD']);
  if (head.status !== 0 || head.stdout.trim() !== pinnedSource) throw new Error('Official superagent source commit mismatch or Git unavailable');
  const diff = git(['diff', '--exit-code', '--name-only', '--no-ext-diff', 'HEAD', '--']);
  if (diff.status !== 0) throw new Error(`Official superagent tracked source changed: ${diff.stdout.trim() || diff.stderr.trim()}`);
  return { cli, pnpm, source, sourceHead: head.stdout.trim() };
}

function profile(home, name, consumer, source, bundles, rows = []) {
  const dir = resolve(home, 'profiles', name);
  mkdirSync(resolve(dir, 'node_modules'), { recursive: true });
  save(resolve(dir, 'package.json'), {
    name: `sentiscope-check-${name}`, private: true, type: 'module',
    dependencies: { 'dsh-superagent': `link:${source}`, 'sentiscope-sdk-check': `link:${consumer}` },
    dsh: { profile: { bundles } },
  });
  symlinkSync(source, resolve(dir, 'node_modules/dsh-superagent'), 'dir');
  symlinkSync(consumer, resolve(dir, 'node_modules/sentiscope-sdk-check'), 'dir');
  save(resolve(dir, 'cordis.patch.yml'), rows.length ? [{ insert: rows }] : []);
  return dir;
}

async function runHost(label, profileName, outputFile, installation, output, env) {
  const stdout = resolve(output, `${label}.stdout`);
  const stderr = resolve(output, `${label}.stderr`);
  const descriptors = [openSync(stdout, 'wx'), openSync(stderr, 'wx')];
  const args = [installation.cli, '--profile', profileName];
  const child = spawn(process.execPath, args, { cwd: output, env, stdio: ['ignore', ...descriptors] });
  const record = { label, argv: [process.execPath, ...args], profileName, startedAt: new Date().toISOString(), stdout, stderr };
  let timedOut = false;
  let killTimer;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGINT');
    killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
  }, 30000);
  try {
    await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => { Object.assign(record, { exitCode: code, signal }); accept(); });
    });
  } catch (error) {
    record.error = error.message;
  } finally {
    clearTimeout(timer); clearTimeout(killTimer);
    descriptors.forEach(closeSync);
    Object.assign(record, { endedAt: new Date().toISOString(), timedOut });
    save(resolve(output, `${label}-process.json`), record);
  }
  if (record.error || timedOut || record.exitCode !== 0 || !existsSync(outputFile)) {
    throw new Error(`${label} failed; inspect ${stderr}`);
  }
  const result = json(outputFile);
  if (result.status !== 'PASS') throw new Error(`${label} assertion failed; inspect ${outputFile}`);
  return { label, process: record, result };
}

async function main() {
  const { sdk, output } = parseArgs(process.argv.slice(2));
  if (existsSync(output)) throw new Error('Output directory already exists; choose a new private run directory');
  const home = resolve(output, 'home');
  const env = environment(home);
  const installation = requireInstallation(sdk, env);
  mkdirSync(dirname(output), { recursive: true }); mkdirSync(output);
  const summary = { status: 'FAIL', scope: 'SDK minimal root/idle checks only; no product integration or model work', installation, output, runs: [] };
  try {
    const consumer = resolve(output, 'consumer');
    mkdirSync(resolve(consumer, 'node_modules'), { recursive: true });
    for (const name of ['root-probe.mjs', 'native-probe.mjs']) copyFileSync(resolve(scripts, name), resolve(consumer, name));
    save(resolve(consumer, 'package.json'), {
      name: 'sentiscope-sdk-check', private: true, version: '0.0.0', type: 'module', main: 'root-probe.mjs',
      dependencies: { 'dsh-superagent': `link:${installation.source}` },
      peerDependencies: { '@deepseek-ai/cordis': '4.1.0', '@deepseek-ai/schemastery': '3.19.0', '@deepseek-ai/dsh-agent': expectedVersion, '@deepseek-ai/dsh-session': expectedVersion, '@deepseek-ai/dsh-llm': expectedVersion },
    });
    symlinkSync(installation.source, resolve(consumer, 'node_modules/dsh-superagent'), 'dir');
    const rootResult = resolve(output, 'root-result.json');
    const nativeResult = resolve(output, 'native-first.json');
    const coldResult = resolve(output, 'native-cold.json');
    profile(home, 'sdk-root-check', consumer, installation.source, [], [{ id: 'root-probe', name: 'sentiscope-sdk-check', config: { output: rootResult, scratch: resolve(output, 'scratch') } }]);
    const services = [
      ['llm', 'dsh-llm'], ['session', 'dsh-session'], ['projection', 'dsh-session-projection'],
      ['prompt', 'dsh-system-prompt'], ['tools', 'dsh-tools'], ['agent', 'dsh-agent'], ['loop', 'dsh-agent-loop'],
      ['persistence', 'dsh-session-persistence-jsonl', { root: resolve(output, 'state/sessions'), compression: 'none' }],
      ['storage', 'dsh-storage'], ['storage-json', 'dsh-storage-json', { root: resolve(output, 'state/storage') }],
      ['storage-domain', 'dsh-storage-domain', { backend: 'json' }], ['schedule', 'dsh-schedule'],
    ].map(([id, name, config]) => ({ id, name: `@deepseek-ai/${name}`, ...(config ? { config } : {}) }));
    profile(home, 'sdk-native-first', consumer, installation.source, [], [...services, { id: 'native-probe', name: 'sentiscope-sdk-check/native-probe.mjs', config: { output: nativeResult, phase: 'create' } }]);
    profile(home, 'sdk-native-cold', consumer, installation.source, [], [...services, { id: 'native-probe', name: 'sentiscope-sdk-check/native-probe.mjs', config: { output: coldResult, phase: 'cold', prior: nativeResult } }]);
    for (const [label, name, result] of [['root', 'sdk-root-check', rootResult], ['native-first', 'sdk-native-first', nativeResult], ['native-cold', 'sdk-native-cold', coldResult]]) {
      summary.runs.push(await runHost(label, name, result, installation, output, env));
    }
    summary.identities = [installation.cli, resolve(installation.source, 'package.json'), resolve(installation.source, 'pnpm-lock.yaml'), resolve(installation.source, 'lib/index.js'), resolve(scripts, 'root-probe.mjs'), resolve(scripts, 'native-probe.mjs')].map(path => ({ path, sha256: hash(path) }));
    summary.status = 'PASS';
  } catch (error) {
    summary.error = error.message;
  }
  save(resolve(output, 'result.json'), summary);
  console.log(`${summary.status}: ${resolve(output, 'result.json')}`);
  process.exitCode = summary.status === 'PASS' ? 0 : 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
