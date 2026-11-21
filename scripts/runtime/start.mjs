import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const generator = 'optrasentiscope-runtime-start-v1';
const profileRoot = '# dsh profile root — an empty entry list. The tree is composed as patches:\n# each bundle in package.json\'s dsh.profile.bundles, then cordis.patch.yml, then any\n# --patch overlays. Edit cordis.patch.yml, not this file.\n[]\n';
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = value => createHash('sha256').update(value).digest('hex');
const inside = (target, root) => { const part = relative(root, target); return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part); };
function canonical(path) {
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  return resolve(realpathSync(ancestor), relative(ancestor, path));
}

function privatePath(path) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('PRIVATE_PATH_REQUIRED');
  const target = resolve(project, path); const local = resolve(project, '.local');
  if (!inside(target, local)) throw new Error('PATH_MUST_BE_PROJECT_PRIVATE');
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actualLocal = existsSync(local) ? realpathSync(local) : local;
  const actual = realpathSync(ancestor);
  if (!inside(actualLocal, realpathSync(project)) || (actual !== realpathSync(project) && actual !== actualLocal && !inside(actual, actualLocal))) throw new Error('PRIVATE_PATH_ESCAPE');
  return target;
}

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error(`INVALID_${label}`);
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\u0000-\u001f]/.test(value)) throw new Error(`INVALID_${label}`);
  return value;
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`INVALID_${label}`);
  return value;
}
function reference(value, label, max = 128) {
  const result = text(value, label);
  if (result.length > max || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(result) || result.includes('://')) throw new Error(`INVALID_${label}`);
  return result;
}
function dictionary(value, label, normalize) {
  object(value, Object.keys(value ?? {}), label);
  const result = Object.create(null);
  for (const [id, entry] of Object.entries(value)) result[text(id, label)] = normalize(entry);
  return result;
}
function budgetLimits(value) {
  object(value, ['modelRequests', 'outputTokens', 'computeMilliseconds'], 'BUDGET_LIMITS');
  return Object.fromEntries(['modelRequests', 'outputTokens', 'computeMilliseconds'].map(key => [key, integer(value[key], 0, Number.MAX_SAFE_INTEGER, 'BUDGET_LIMIT')]));
}
function budgetConfig(value) {
  object(value, ['revision', 'limits', 'expiresAt'], 'BUDGET_CONFIG');
  const expires = Date.parse(text(value.expiresAt, 'BUDGET_EXPIRY'));
  if (!Number.isFinite(expires)) throw new Error('INVALID_BUDGET_EXPIRY');
  return { revision: integer(value.revision, 1, Number.MAX_SAFE_INTEGER, 'BUDGET_REVISION'), limits: budgetLimits(value.limits), expiresAt: new Date(expires).toISOString() };
}
function modelEgress(value, revisionRequired) {
  object(value, ['enabled', 'provider', 'model', 'maxTokens', 'credential', ...(revisionRequired ? ['revision'] : [])], 'MODEL_EGRESS');
  if (typeof value.enabled !== 'boolean') throw new Error('INVALID_MODEL_EGRESS_ENABLED');
  const result = { ...(revisionRequired ? { revision: integer(value.revision, 1, Number.MAX_SAFE_INTEGER, 'EGRESS_REVISION') } : {}), enabled: value.enabled, provider: reference(value.provider, 'EGRESS_PROVIDER'), model: reference(value.model, 'EGRESS_MODEL'), maxTokens: integer(value.maxTokens, 1, 1048576, 'EGRESS_MAX_TOKENS') };
  if (value.credential !== undefined) {
    object(value.credential, ['ref', 'revision'], 'EGRESS_CREDENTIAL_REFERENCE');
    result.credential = { ref: reference(value.credential.ref, 'CREDENTIAL_REFERENCE'), revision: integer(value.credential.revision, 1, Number.MAX_SAFE_INTEGER, 'CREDENTIAL_REVISION') };
  }
  return result;
}
function credentialGrant(value, delegationRequired) {
  object(value, ['provider', 'purpose', 'ref', 'revision', 'enabled', 'recordKey', ...(delegationRequired ? ['delegationId'] : [])], 'CREDENTIAL_GRANT');
  if (typeof value.enabled !== 'boolean' || !['model', 'connector'].includes(value.purpose)) throw new Error('INVALID_CREDENTIAL_GRANT');
  const recordKey = reference(value.recordKey, 'CREDENTIAL_RECORD_KEY', 256);
  if (!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(recordKey)) throw new Error('INVALID_CREDENTIAL_RECORD_KEY');
  return { ...(delegationRequired ? { delegationId: text(value.delegationId, 'CREDENTIAL_DELEGATION') } : {}), provider: reference(value.provider, 'CREDENTIAL_PROVIDER'), purpose: value.purpose, ref: reference(value.ref, 'CREDENTIAL_REFERENCE'), revision: integer(value.revision, 1, Number.MAX_SAFE_INTEGER, 'CREDENTIAL_REVISION'), enabled: value.enabled, recordKey };
}
function credentialGrants(value, delegationRequired) {
  if (!Array.isArray(value)) throw new Error('INVALID_CREDENTIAL_GRANTS');
  return value.map(grant => credentialGrant(grant, delegationRequired));
}
function resourceDefaults(value) {
  object(value, ['budget', 'modelEgress', 'credentials'], 'RESOURCE_DEFAULTS');
  const result = {};
  if (value.budget !== undefined) {
    object(value.budget, ['limits', 'durationMs'], 'DEFAULT_BUDGET');
    result.budget = { limits: budgetLimits(value.budget.limits), durationMs: integer(value.budget.durationMs, 1, 2147483647, 'DEFAULT_BUDGET_DURATION') };
  }
  if (value.modelEgress !== undefined) result.modelEgress = modelEgress(value.modelEgress, false);
  if (value.credentials !== undefined) result.credentials = credentialGrants(value.credentials, false);
  return result;
}

function parse(args) {
  const options = { runtimeRoot: '.local/product-runtime', sdkRoot: '.local/official-sdk' };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--help') return { help: true };
    if (!['--config', '--runtime-root', '--sdk-root'].includes(flag) || !args.length || args[0].startsWith('--')) throw new Error(`UNKNOWN_OPTION_OR_MISSING_VALUE: ${flag}`);
    options[{ '--config': 'config', '--runtime-root': 'runtimeRoot', '--sdk-root': 'sdkRoot' }[flag]] = args.shift();
  }
  return options;
}

function hostConfig(path, runtimeRoot) {
  let input = {};
  if (path) {
    const file = privatePath(path);
    try { input = JSON.parse(readFileSync(file, 'utf8')); }
    catch { throw new Error('INVALID_HOST_CONFIG_DOCUMENT'); }
  }
  object(input, ['dataDirectory', 'owner', 'port', 'model', 'intervalSeconds', 'grants', 'budgets', 'modelEgress', 'credentialGrants', 'resourceDefaults', 'auth', 'syntheticTrial'], 'HOST_CONFIG');
  const owner = input.owner ?? { enterpriseId: 'local-enterprise', principalId: 'local-operator' };
  object(owner, ['enterpriseId', 'principalId'], 'OWNER');
  const config = {
    dataDirectory: privatePath(input.dataDirectory ?? resolve(runtimeRoot, 'data')),
    owner: { enterpriseId: text(owner.enterpriseId, 'ENTERPRISE_ID'), principalId: text(owner.principalId, 'PRINCIPAL_ID') },
    port: integer(input.port ?? 8766, 0, 65535, 'PORT'), grants: Object.create(null),
  };
  if (input.model !== undefined) {
    object(input.model, ['provider', 'model', 'maxTokens'], 'MODEL_REFERENCE');
    config.model = { provider: reference(input.model.provider, 'PROVIDER_REFERENCE'), model: reference(input.model.model, 'MODEL_REFERENCE') };
    if (input.model.maxTokens !== undefined) config.model.maxTokens = integer(input.model.maxTokens, 1, 1048576, 'MAX_TOKENS');
  }
  if (input.intervalSeconds !== undefined) config.intervalSeconds = integer(input.intervalSeconds, 60, 86400, 'INTERVAL_SECONDS');
  if (input.syntheticTrial !== undefined) {
    if (typeof input.syntheticTrial !== 'boolean') throw new Error('INVALID_SYNTHETIC_TRIAL');
    config.syntheticTrial = input.syntheticTrial;
    if (input.syntheticTrial && input.model === undefined) config.model = { provider: 'sentiscope-synthetic-trial', model: 'synthetic', maxTokens: 128 };
  }
  if (input.budgets !== undefined) config.budgets = dictionary(input.budgets, 'BUDGET_DELEGATION_ID', budgetConfig);
  if (input.modelEgress !== undefined) config.modelEgress = dictionary(input.modelEgress, 'EGRESS_DELEGATION_ID', grant => modelEgress(grant, true));
  if (input.credentialGrants !== undefined) config.credentialGrants = credentialGrants(input.credentialGrants, true);
  if (input.resourceDefaults !== undefined) config.resourceDefaults = resourceDefaults(input.resourceDefaults);
  if (input.auth !== undefined) {
    object(input.auth, ['operatorTokenHash', 'maintainerTokenHash', 'sessionTtlSeconds'], 'AUTH');
    const tokenHash = value => { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('INVALID_AUTH_TOKEN_HASH'); return value; };
    config.auth = { operatorTokenHash: tokenHash(input.auth.operatorTokenHash), maintainerTokenHash: tokenHash(input.auth.maintainerTokenHash) };
    if (input.auth.sessionTtlSeconds !== undefined) config.auth.sessionTtlSeconds = integer(input.auth.sessionTtlSeconds, 60, 86400, 'SESSION_TTL_SECONDS');
  }
  if (input.grants !== undefined) {
    object(input.grants, Object.keys(input.grants), 'GRANTS');
    for (const [delegationId, grants] of Object.entries(input.grants)) {
      text(delegationId, 'GRANT_DELEGATION_ID');
      if (!Array.isArray(grants)) throw new Error('INVALID_DELEGATION_GRANTS');
      config.grants[delegationId] = grants.map(grant => {
        object(grant, ['sourceId', 'directory', 'grantRevision', 'enabled', 'cacheBody', 'allowHistorical', 'maxFiles', 'maxBytes'], 'SOURCE_GRANT');
        if (typeof grant.enabled !== 'boolean') throw new Error('INVALID_SOURCE_GRANT_ENABLED');
        const result = { sourceId: text(grant.sourceId, 'SOURCE_ID'), directory: resolve(project, text(grant.directory, 'SOURCE_DIRECTORY')), grantRevision: integer(grant.grantRevision, 1, Number.MAX_SAFE_INTEGER, 'GRANT_REVISION'), enabled: grant.enabled };
        for (const field of ['cacheBody', 'allowHistorical']) if (grant[field] !== undefined) {
          if (typeof grant[field] !== 'boolean') throw new Error(`INVALID_${field}`);
          result[field] = grant[field];
        }
        if (grant.maxFiles !== undefined) result.maxFiles = integer(grant.maxFiles, 1, 1000, 'MAX_FILES');
        if (grant.maxBytes !== undefined) result.maxBytes = integer(grant.maxBytes, 1, 1048576, 'MAX_BYTES');
        return result;
      });
    }
  }
  return config;
}

function directory(path) {
  if (existsSync(path) && !lstatSync(path).isDirectory()) throw new Error('MANAGED_DIRECTORY_CONFLICT');
  mkdirSync(path, { recursive: true, mode: 0o700 });
}
function exact(path, expected) {
  if (existsSync(path) && (!lstatSync(path).isFile() || readFileSync(path, 'utf8') !== expected)) throw new Error(`GENERATED_FILE_CONFLICT: ${path}`);
}
function writeNew(path, value) { if (!existsSync(path)) writeFileSync(path, value, { flag: 'wx', mode: 0o600 }); }
function link(path, target) {
  if (existsSync(path)) {
    if (!lstatSync(path).isSymbolicLink() || realpathSync(path) !== realpathSync(target)) throw new Error(`GENERATED_LINK_CONFLICT: ${path}`);
  } else symlinkSync(target, path, 'dir');
}

function profile(runtimeRoot, sdkRoot, config) {
  const home = privatePath(resolve(runtimeRoot, 'home'));
  const homeMarker = resolve(home, '.sentiscope-generated.json');
  const homeIdentity = json({ generator, kind: 'private-dsh-home' });
  if (existsSync(home) && !existsSync(homeMarker) && readdirSync(home).length) throw new Error('UNKNOWN_EXISTING_DSH_HOME');
  exact(homeMarker, homeIdentity); exact(resolve(home, 'cordis.patch.yml'), '[]\n');
  const consumer = resolve(project, 'runtime'); const source = resolve(sdkRoot, 'superagent');
  const services = [
    ['credentials', 'dsh-credentials-local', { path: resolve(config.dataDirectory, 'private/credentials.yaml'), watch: false }],
    ['llm', 'dsh-llm'], ['session', 'dsh-session'], ['projection', 'dsh-session-projection'],
    ['prompt', 'dsh-system-prompt'], ['tools', 'dsh-tools'], ['native-executor', 'dsh-tool-executor-native'],
    ['agent', 'dsh-agent'], ['loop', 'dsh-agent-loop'],
    ['persistence', 'dsh-session-persistence-jsonl', { root: resolve(config.dataDirectory, 'sessions'), compression: 'none' }],
    ['storage', 'dsh-storage'], ['storage-json', 'dsh-storage-json', { root: resolve(config.dataDirectory, 'storage') }],
    ['storage-domain', 'dsh-storage-domain', { backend: 'json' }], ['schedule', 'dsh-schedule'],
  ].map(([id, name, options]) => ({ id, name: `@deepseek-ai/${name}`, ...(options ? { config: options } : {}) }));
  const synthetic = config.syntheticTrial ? [{ id: 'synthetic-trial-provider', name: 'sentiscope-runtime/synthetic', config: { provider: 'sentiscope-synthetic-trial' } }] : [];
  const patch = json([{ insert: [...services, ...synthetic, { id: 'sentiscope', name: 'sentiscope-runtime/plugin', config }] }]);
  // A changed explicit Host configuration creates a fresh profile; earlier profiles are retained.
  const name = `sentiscope-product-${digest(json({ patch, source, consumer })).slice(0, 16)}`;
  const path = privatePath(resolve(home, 'profiles', name));
  const manifest = json({ name, private: true, type: 'module', dependencies: { 'dsh-superagent': `link:${source}`, 'sentiscope-runtime': `link:${consumer}` }, dsh: { profile: { bundles: [] } } });
  const marker = json({ generator, kind: 'minimal-product-profile', files: { 'package.json': digest(manifest), 'cordis.patch.yml': digest(patch) }, links: { 'dsh-superagent': source, 'sentiscope-runtime': consumer } });
  const markerPath = resolve(path, '.sentiscope-generated.json');
  if (existsSync(path) && !existsSync(markerPath)) throw new Error('UNKNOWN_EXISTING_PROFILE');
  exact(markerPath, marker); exact(resolve(path, 'package.json'), manifest); exact(resolve(path, 'cordis.patch.yml'), patch);
  // The official CLI owns this empty include root and rewrites it on each boot.
  exact(resolve(path, 'cordis.yml'), profileRoot);
  directory(home); directory(resolve(home, 'profiles')); directory(path); directory(resolve(path, 'node_modules'));
  link(resolve(path, 'node_modules/dsh-superagent'), source); link(resolve(path, 'node_modules/sentiscope-runtime'), consumer);
  writeNew(resolve(home, 'cordis.patch.yml'), '[]\n'); writeNew(homeMarker, homeIdentity);
  writeNew(resolve(path, 'package.json'), manifest); writeNew(resolve(path, 'cordis.patch.yml'), patch); writeNew(markerPath, marker);
  return { name, home };
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    console.log('node scripts/runtime/start.mjs [--config .local/host.json] [--runtime-root .local/product-runtime] [--sdk-root .local/official-sdk]\nPrivate Host JSON: dataDirectory, owner {enterpriseId,principalId}, port, optional model {provider,model,maxTokens}, intervalSeconds, grants {delegationId: SourceGrant[]}, budgets, modelEgress, credentialGrants, resourceDefaults, auth {operatorTokenHash,maintainerTokenHash,sessionTtlSeconds}, syntheticTrial (boolean).\nResource configuration holds limits and non-secret references only. Credentials stay in data/private/credentials.yaml; no external Provider, network or compute enable flag is supported. syntheticTrial=true registers only the fixed in-process local synthetic adapter (sentiscope-synthetic-trial/synthetic) for loopback trial use and still requires auth; it never enables external model transport.\nAll relative paths resolve from the project. Defaults: port 8766, no model, no sources, no enabled model transport. No installation or inherited DSH configuration.');
    return;
  }
  process.umask(0o077);
  const runtimeRoot = privatePath(options.runtimeRoot); const sdkRoot = privatePath(options.sdkRoot);
  const config = hostConfig(options.config, runtimeRoot);
  for (const path of [runtimeRoot, config.dataDirectory]) {
    const actual = canonical(path); const sdk = canonical(sdkRoot);
    if (actual === sdk || inside(actual, sdk) || inside(sdk, actual)) throw new Error('PRODUCT_STATE_OVERLAPS_OFFICIAL_SDK');
  }
  const data = canonical(config.dataDirectory); const home = canonical(resolve(runtimeRoot, 'home'));
  if (data === home || inside(data, home) || inside(home, data)) throw new Error('PRODUCT_DATA_OVERLAPS_PROFILE_HOME');
  const consumerManifest = JSON.parse(readFileSync(resolve(project, 'runtime/package.json'), 'utf8'));
  if (consumerManifest.name !== 'sentiscope-runtime' || !consumerManifest.exports?.['./plugin'] || (config.syntheticTrial && !consumerManifest.exports?.['./synthetic'])) throw new Error('PRODUCT_PLUGIN_EXPORT_MISSING');
  const { prepare } = await import('./prepare.mjs');
  const prepared = await prepare({ project, sdkRoot, consumerRoot: 'runtime', installMissing: false });
  if (prepared.status !== 'PASS') throw new Error(`SDK_PREPARATION_FAILED: ${prepared.error ?? prepared.output}`);
  directory(runtimeRoot);
  const selected = profile(runtimeRoot, sdkRoot, config);
  const env = Object.fromEntries(['PATH', 'LANG', 'TMPDIR'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
  env.DSH_HOME = selected.home;
  const cli = resolve(sdkRoot, 'harness/node_modules/@deepseek-ai/dsh/lib/bin.js');
  const child = spawn(process.execPath, [cli, '--profile', selected.name], { cwd: runtimeRoot, env, stdio: 'inherit' });
  const forward = signal => { child.kill(signal); };
  const interrupt = () => forward('SIGINT'); const terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    const result = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', (code, signal) => accept({ code, signal })); });
    process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
    if (result.signal) process.kill(process.pid, result.signal);
    else process.exitCode = result.code ?? 1;
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
