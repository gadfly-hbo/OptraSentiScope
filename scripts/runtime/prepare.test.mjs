import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, symlinkSync, copyFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { prepare, ensureConsumerLinks, verifyNpmComponent, verifySuperagentSource } from './prepare.mjs';

const temporary = resolve('.local/tests');
mkdirSync(temporary, { recursive: true });
function fixture() { return mkdtempSync(join(temporary, 'sdk-prepare-')); }

test('default preparation refuses a missing SDK without network or creating an install', async () => {
  const project = fixture();
  const sdkRoot = join(project, '.local/official-sdk');
  let commands = 0;
  try {
    const result = await prepare({ project, sdkRoot }, { runCommand: async () => { commands++; throw new Error('No command may run'); } });
    assert.equal(result.status, 'FAIL');
    assert.match(result.error, /INSTALL_MISSING_OPT_IN_REQUIRED/);
    assert.equal(commands, 0);
    assert.equal(existsSync(sdkRoot), false);
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test('explicit install preserves and refuses an unknown existing component directory', async () => {
  const project = fixture();
  const sdkRoot = join(project, '.local/official-sdk');
  const component = join(sdkRoot, 'harness');
  mkdirSync(component, { recursive: true });
  writeFileSync(join(component, 'sentinel'), 'Keep this existing directory.');
  let commands = 0;
  try {
    const result = await prepare({ project, sdkRoot, installMissing: true }, { runCommand: async () => { commands++; throw new Error('No command may run'); } });
    assert.equal(result.status, 'FAIL');
    assert.match(result.error, /UNKNOWN_EXISTING_COMPONENT/);
    assert.equal(commands, 0);
    assert.equal(readFileSync(join(component, 'sentinel'), 'utf8'), 'Keep this existing directory.');
    assert.equal(existsSync(join(component, 'package.json')), false);
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test('a wrong installed version is refused rather than reinstalled', () => {
  const project = fixture();
  const component = join(project, 'harness');
  mkdirSync(join(component, 'node_modules/@deepseek-ai/dsh'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) copyFileSync(resolve('runtime/locks/harness', file), join(component, file));
  const installed = join(component, 'node_modules/@deepseek-ai/dsh/package.json');
  writeFileSync(installed, JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.0.0-wrong' }));
  try {
    assert.throws(() => verifyNpmComponent(project, 'harness', true), /INSTALLED_VERSION_MISMATCH/);
    assert.equal(JSON.parse(readFileSync(installed, 'utf8')).version, '0.0.0-wrong');
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test('a wrong source HEAD is refused using only a read command', async () => {
  const source = fixture();
  mkdirSync(join(source, '.git'));
  writeFileSync(join(source, 'sentinel'), 'preserve wrong checkout');
  const commands = [];
  try {
    await assert.rejects(verifySuperagentSource(source, async (file, args) => { commands.push([file, ...args]); return '0000000000000000000000000000000000000000\n'; }), /SUPERAGENT_HEAD_MISMATCH/);
    assert.deepEqual(commands, [['git', '-C', source, 'rev-parse', 'HEAD']]);
    assert.equal(readFileSync(join(source, 'sentinel'), 'utf8'), 'preserve wrong checkout');
  } finally { rmSync(source, { recursive: true, force: true }); }
});

test('link preflight preserves a conflicting destination and publishes no partial links', () => {
  const project = fixture();
  const sdk = join(project, 'sdk');
  const consumer = join(project, 'consumer');
  mkdirSync(join(sdk, 'harness/node_modules/@deepseek-ai'), { recursive: true });
  mkdirSync(join(sdk, 'superagent'), { recursive: true });
  mkdirSync(join(consumer, 'node_modules/@deepseek-ai'), { recursive: true });
  writeFileSync(join(consumer, 'node_modules/@deepseek-ai/sentinel'), 'existing files');
  try {
    assert.throws(() => ensureConsumerLinks(consumer, sdk), /CONSUMER_LINK_CONFLICT/);
    assert.equal(existsSync(join(consumer, 'node_modules/dsh-superagent')), false);
    assert.equal(readFileSync(join(consumer, 'node_modules/@deepseek-ai/sentinel'), 'utf8'), 'existing files');
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test('a broken existing consumer symlink is preserved and refused', () => {
  const project = fixture();
  const sdk = join(project, 'sdk');
  const consumer = join(project, 'consumer');
  mkdirSync(join(sdk, 'harness/node_modules/@deepseek-ai'), { recursive: true });
  mkdirSync(join(sdk, 'superagent'), { recursive: true });
  mkdirSync(join(consumer, 'node_modules'), { recursive: true });
  symlinkSync(join(project, 'missing-target'), join(consumer, 'node_modules/dsh-superagent'));
  try {
    assert.throws(() => ensureConsumerLinks(consumer, sdk), /CONSUMER_LINK_CONFLICT/);
    assert.equal(existsSync(join(consumer, 'node_modules/@deepseek-ai')), false);
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test('consumer links point to only the approved local roots and are idempotent', () => {
  const project = fixture();
  const sdk = join(project, 'sdk');
  const consumer = join(project, 'consumer');
  mkdirSync(join(sdk, 'harness/node_modules/@deepseek-ai'), { recursive: true });
  mkdirSync(join(sdk, 'superagent'), { recursive: true });
  try {
    ensureConsumerLinks(consumer, sdk);
    ensureConsumerLinks(consumer, sdk);
    assert.equal(realpathSync(join(consumer, 'node_modules/@deepseek-ai')), join(sdk, 'harness/node_modules/@deepseek-ai'));
    assert.equal(realpathSync(join(consumer, 'node_modules/dsh-superagent')), join(sdk, 'superagent'));
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test('an existing evidence directory is preserved without adding or overwriting a result', async () => {
  const project = fixture();
  const output = join(project, '.local/evidence');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'sentinel'), 'keep evidence');
  try {
    const result = await prepare({ project, output });
    assert.equal(result.status, 'FAIL');
    assert.match(result.error, /EVIDENCE_DIRECTORY_EXISTS/);
    assert.equal(existsSync(join(output, 'result.json')), false);
    assert.equal(readFileSync(join(output, 'sentinel'), 'utf8'), 'keep evidence');
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test('explicit missing install uses the exact copied lock and records a failed npm command', async () => {
  const project = fixture();
  const sdkRoot = join(project, '.local/official-sdk');
  const calls = [];
  try {
    const result = await prepare({ project, sdkRoot, installMissing: true }, { runCommand: async (file, args, cwd) => { calls.push({ file, args, cwd }); return { exitCode: 1, stdout: 'synthetic install failure' }; } });
    assert.equal(result.status, 'FAIL');
    assert.match(result.error, /COMMAND_FAILED/);
    assert.deepEqual(calls, [{ file: 'npm', args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: join(sdkRoot, 'harness') }]);
    assert.equal(readFileSync(join(sdkRoot, 'harness/package-lock.json'), 'utf8'), readFileSync(resolve('runtime/locks/harness/package-lock.json'), 'utf8'));
    assert.equal(existsSync(join(sdkRoot, 'toolchain')), false);
    assert.equal(existsSync(join(sdkRoot, 'superagent')), false);
    const evidence = JSON.parse(readFileSync(join(result.output, 'commands/01-result.json'), 'utf8'));
    assert.equal(evidence.exitCode, 1);
  } finally { rmSync(project, { recursive: true, force: true }); }
});

test('an unknown source directory blocks installation of every other missing component', async () => {
  const project = fixture();
  const sdkRoot = join(project, '.local/official-sdk');
  mkdirSync(join(sdkRoot, 'superagent'), { recursive: true });
  writeFileSync(join(sdkRoot, 'superagent/sentinel'), 'preserve source directory');
  let commands = 0;
  try {
    const result = await prepare({ project, sdkRoot, installMissing: true }, { runCommand: async () => { commands++; throw new Error('Must fail before any install'); } });
    assert.equal(result.status, 'FAIL');
    assert.match(result.error, /UNKNOWN_EXISTING_COMPONENT/);
    assert.equal(commands, 0);
    assert.equal(existsSync(join(sdkRoot, 'harness')), false);
    assert.equal(existsSync(join(sdkRoot, 'toolchain')), false);
    assert.equal(readFileSync(join(sdkRoot, 'superagent/sentinel'), 'utf8'), 'preserve source directory');
  } finally { rmSync(project, { recursive: true, force: true }); }
});
