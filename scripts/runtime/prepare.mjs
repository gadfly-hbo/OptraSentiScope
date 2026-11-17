import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { closeSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const locks = resolve(repository, 'runtime/locks');
const identity = JSON.parse(readFileSync(resolve(locks, 'identity.json'), 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const entryExists = path => { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };

function inside(path, parent) {
  const part = relative(parent, path);
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

function privatePath(project, path) {
  const target = resolve(project, path);
  const local = resolve(project, '.local');
  if (!inside(target, local)) throw new Error('PATH_MUST_BE_PROJECT_PRIVATE');
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actual = realpathSync(ancestor);
  if (actual !== realpathSync(project) && actual !== local && !inside(actual, local)) throw new Error('PRIVATE_PATH_ESCAPE');
  return target;
}

function verifyFiles(root, files) {
  for (const [name, expected] of Object.entries(files)) {
    const path = resolve(root, name);
    if (!inside(path, root) || !existsSync(path) || !inside(realpathSync(path), realpathSync(root))) throw new Error(`IDENTITY_FILE_MISSING_OR_ESCAPED: ${name}`);
    if (hash(path) !== expected) throw new Error(`IDENTITY_HASH_MISMATCH: ${name}`);
  }
}

function validateLocks() {
  verifyFiles(locks, identity.locks);
  for (const name of ['harness', 'toolchain']) {
    for (const file of ['package.json', 'package-lock.json']) {
      const text = readFileSync(resolve(locks, name, file), 'utf8');
      if (/\/Users\/|\/home\/|"(?:_authToken|_auth|password|secret|token)"\s*:|https:\/\/[^/\s"]+@/.test(text)) throw new Error('LOCK_CONTAINS_PRIVATE_DATA');
      const value = JSON.parse(text);
      for (const entry of Object.values(value.packages ?? {})) {
        if (entry.resolved && !entry.resolved.startsWith('https://registry.npmjs.org/')) throw new Error('LOCK_NONOFFICIAL_REGISTRY');
      }
    }
  }
}

export function verifyNpmComponent(root, name, installMissing = false) {
  if (!['harness', 'toolchain'].includes(name)) throw new Error('UNKNOWN_COMPONENT_NAME');
  const path = resolve(root, name);
  if (!entryExists(path)) {
    if (!installMissing) throw new Error(`INSTALL_MISSING_OPT_IN_REQUIRED: ${name}`);
    return 'missing';
  }
  if (!lstatSync(path).isDirectory()) throw new Error(`UNKNOWN_EXISTING_COMPONENT: ${name}`);
  for (const file of ['package.json', 'package-lock.json']) {
    const expected = identity.locks[`${name}/${file}`];
    const artifact = resolve(path, file);
    if (!existsSync(artifact) || !inside(realpathSync(artifact), realpathSync(path)) || hash(artifact) !== expected) throw new Error(`UNKNOWN_EXISTING_COMPONENT: ${name}/${file}`);
  }
  if (!existsSync(resolve(path, 'node_modules'))) {
    if (!installMissing) throw new Error(`INSTALL_MISSING_OPT_IN_REQUIRED: ${name}/node_modules`);
    if (readdirSync(path).some(file => !['package.json', 'package-lock.json'].includes(file))) throw new Error(`UNKNOWN_EXISTING_COMPONENT: ${name}`);
    return 'prepared';
  }
  const packageName = name === 'harness' ? '@deepseek-ai/dsh' : 'pnpm';
  const installed = resolve(path, 'node_modules', packageName, 'package.json');
  const version = name === 'harness' ? identity.harnessVersion : identity.pnpmVersion;
  if (!existsSync(installed) || !inside(realpathSync(installed), realpathSync(path)) || json(installed).name !== packageName || json(installed).version !== version) throw new Error(`INSTALLED_VERSION_MISMATCH: ${name}`);
  if (name === 'harness') verifyFiles(path, identity.hostFiles);
  else verifyFiles(path, identity.toolchainFiles);
  return 'complete';
}

export async function verifySuperagentSource(source, command) {
  if (!lstatSync(source).isDirectory() || !existsSync(resolve(source, '.git')) || !lstatSync(resolve(source, '.git')).isDirectory() || !inside(realpathSync(resolve(source, '.git')), realpathSync(source))) throw new Error('UNKNOWN_EXISTING_COMPONENT: superagent');
  const head = (await command('git', ['-C', source, 'rev-parse', 'HEAD'], { capture: true })).trim();
  if (head !== identity.sourceCommit) throw new Error('SUPERAGENT_HEAD_MISMATCH');
  const changed = (await command('git', ['-C', source, 'status', '--porcelain', '--untracked-files=no'], { capture: true })).trim();
  if (changed) throw new Error('SUPERAGENT_TRACKED_SOURCE_CHANGED');
  verifyFiles(source, identity.superagentFiles);
}

/** Preflight every link before writing either one; existing destinations are never removed. */
export function ensureConsumerLinks(consumer, sdkRoot) {
  const modules = resolve(consumer, 'node_modules');
  const links = [
    { path: resolve(modules, '@deepseek-ai'), target: resolve(sdkRoot, 'harness/node_modules/@deepseek-ai') },
    { path: resolve(modules, 'dsh-superagent'), target: resolve(sdkRoot, 'superagent') },
  ];
  if (existsSync(modules) && !lstatSync(modules).isDirectory()) throw new Error('CONSUMER_MODULES_NOT_DIRECTORY');
  for (const link of links) {
    if (!existsSync(link.target)) throw new Error('CONSUMER_TARGET_MISSING');
    let stat;
    try { stat = lstatSync(link.path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat) {
      if (!stat.isSymbolicLink() || !existsSync(link.path) || realpathSync(link.path) !== realpathSync(link.target)) throw new Error(`CONSUMER_LINK_CONFLICT: ${link.path}`);
    }
  }
  mkdirSync(modules, { recursive: true });
  for (const link of links) if (!existsSync(link.path)) symlinkSync(link.target, link.path, 'dir');
  return links;
}

/** Reproducible private setup. Without installMissing, no network-capable command is invoked. */
export async function prepare(options = {}, dependencies = {}) {
  const project = resolve(options.project ?? repository);
  const result = { status: 'FAIL', scope: 'Pinned private SDK setup and consumer entry identity only; no SDK suite, model call, business data or deployment', startedAt: new Date().toISOString(), commands: [], actions: [] };
  let output;
  let ownsOutput = false;
  try {
    const sdkRoot = privatePath(project, options.sdkRoot ?? '.local/official-sdk');
    output = privatePath(project, options.output ?? `.local/runtime-preparation/run-${Date.now()}-${randomUUID()}`);
    const consumer = resolve(project, options.consumerRoot ?? 'runtime');
    if (consumer !== resolve(project, 'runtime')) privatePath(project, consumer);
    else if (existsSync(consumer) && realpathSync(consumer) !== consumer) throw new Error('CONSUMER_PATH_ESCAPE');
    if (entryExists(output)) throw new Error('EVIDENCE_DIRECTORY_EXISTS');
    mkdirSync(resolve(output, 'commands'), { recursive: true, mode: 0o700 });
    ownsOutput = true;
    Object.assign(result, { output, sdkRoot, consumer, installMissing: options.installMissing === true, identity: { harnessVersion: identity.harnessVersion, pnpmVersion: identity.pnpmVersion, sourceCommit: identity.sourceCommit, identitySha256: hash(resolve(locks, 'identity.json')), publicHostFilesChecked: Object.keys(identity.hostFiles).length } });
    validateLocks();
    const command = async (file, args, cwd, { capture = false } = {}) => {
      const number = String(result.commands.length + 1).padStart(2, '0');
      const record = { command: file, argv: args, cwd, startedAt: new Date().toISOString(), stdout: resolve(output, 'commands', `${number}.stdout`), stderr: resolve(output, 'commands', `${number}.stderr`) };
      result.commands.push(record);
      save(resolve(output, 'commands', `${number}-started.json`), record);
      if (dependencies.runCommand) {
        let value;
        try { value = await dependencies.runCommand(file, args, cwd); Object.assign(record, value); }
        catch (error) { record.error = error.message; }
        finally { record.endedAt = new Date().toISOString(); save(resolve(output, 'commands', `${number}-result.json`), record); }
        if (record.error || record.exitCode !== 0) throw new Error(`COMMAND_FAILED: ${number}; inspect ${record.stderr}`);
        return value?.stdout ?? '';
      }
      const env = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
      const config = resolve(output, 'config');
      if (!existsSync(config)) {
        mkdirSync(config, { mode: 0o700 });
        writeFileSync(resolve(config, 'user.npmrc'), '', { flag: 'wx', mode: 0o600 });
        writeFileSync(resolve(config, 'global.npmrc'), '', { flag: 'wx', mode: 0o600 });
      }
      Object.assign(env, { CI: 'true', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', NPM_CONFIG_USERCONFIG: resolve(config, 'user.npmrc'), NPM_CONFIG_GLOBALCONFIG: resolve(config, 'global.npmrc'), NPM_CONFIG_CACHE: resolve(sdkRoot, 'npm-cache'), npm_config_update_notifier: 'false' });
      const descriptors = [openSync(record.stdout, 'wx', 0o600), openSync(record.stderr, 'wx', 0o600)];
      try {
        const child = spawn(file, args, { cwd, env, stdio: ['ignore', ...descriptors] });
        await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => { Object.assign(record, { exitCode: code, signal }); accept(); }); });
      } catch (error) { record.error = error.message; }
      finally {
        descriptors.forEach(closeSync);
        record.endedAt = new Date().toISOString();
        save(resolve(output, 'commands', `${number}-result.json`), record);
      }
      if (record.error || record.exitCode !== 0) throw new Error(`COMMAND_FAILED: ${number}; inspect ${record.stderr}`);
      return capture ? readFileSync(record.stdout, 'utf8') : '';
    };

    // All existing objects are qualified before installing any missing object.
    const states = Object.fromEntries(['harness', 'toolchain'].map(name => [name, verifyNpmComponent(sdkRoot, name, options.installMissing)]));
    const source = resolve(sdkRoot, 'superagent');
    const sourceMissing = !entryExists(source);
    if (sourceMissing && !options.installMissing) throw new Error('INSTALL_MISSING_OPT_IN_REQUIRED: superagent');
    const verifySource = () => verifySuperagentSource(source, (file, args, settings) => command(file, args, project, settings));
    if (!sourceMissing) await verifySource();
    for (const name of ['harness', 'toolchain']) {
      if (states[name] === 'complete') continue;
      const path = resolve(sdkRoot, name);
      if (states[name] === 'missing') {
        mkdirSync(path, { recursive: true });
        for (const file of ['package.json', 'package-lock.json']) copyFileSync(resolve(locks, name, file), resolve(path, file), constants.COPYFILE_EXCL);
      }
      result.actions.push({ action: 'install-pinned-private-npm-component', component: name });
      await command('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], path);
      verifyNpmComponent(sdkRoot, name);
    }
    if (sourceMissing) {
      mkdirSync(source, { recursive: true });
      result.actions.push({ action: 'fetch-fixed-official-source', source: identity.sourceUrl, commit: identity.sourceCommit });
      await command('git', ['init', source], project);
      await command('git', ['-C', source, 'fetch', '--depth=1', identity.sourceUrl, identity.sourceCommit], project);
      await command('git', ['-C', source, 'checkout', '--detach', identity.sourceCommit], project);
      verifyFiles(source, Object.fromEntries(Object.entries(identity.superagentFiles).filter(([name]) => !name.startsWith('lib/'))));
      const pnpm = resolve(sdkRoot, 'toolchain/node_modules/pnpm/bin/pnpm.cjs');
      await command(process.execPath, [pnpm, 'install', '--frozen-lockfile', '--store-dir', resolve(sdkRoot, 'pnpm-store')], source);
      await command(process.execPath, [pnpm, 'run', 'build'], source);
      await verifySource();
    }
    // Verify again before publishing consumer links. Source/build identities remain immutable.
    for (const name of ['harness', 'toolchain']) verifyNpmComponent(sdkRoot, name);
    result.links = ensureConsumerLinks(consumer, sdkRoot);
    result.status = 'PASS';
  } catch (error) { result.error = error.message; }
  finally {
    result.endedAt = new Date().toISOString();
    if (ownsOutput) save(resolve(output, 'result.json'), result);
  }
  return result;
}

function parse(args) {
  const options = {};
  while (args.length) {
    const flag = args.shift();
    if (flag === '--install-missing') options.installMissing = true;
    else if (flag === '--help') return { help: true };
    else if (['--sdk-root', '--consumer-root', '--output'].includes(flag) && args.length && !args[0].startsWith('--')) options[{ '--sdk-root': 'sdkRoot', '--consumer-root': 'consumerRoot', '--output': 'output' }[flag]] = args.shift();
    else throw new Error(`Unknown argument or missing value: ${flag}`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parse(process.argv.slice(2));
    if (options.help) console.log('node scripts/runtime/prepare.mjs [--install-missing] [--sdk-root .local/official-sdk] [--consumer-root runtime] [--output .local/runtime-preparation/new-run]');
    else {
      const result = await prepare(options);
      console.log(`${result.status}: ${result.output ?? 'preflight'}${result.error ? `: ${result.error}` : ''}`);
      process.exitCode = result.status === 'PASS' ? 0 : 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
