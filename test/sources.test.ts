import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, renameSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SentiStore } from '../src/store.ts';
import { SourceStore } from '../src/sources.ts';
import type { SourceEvent, SourceGrant } from '../src/sources.ts';

const owner = { enterpriseId: 'sources-fixture', principalId: 'sources-fixture' };
const root = resolve('.local/archives/engine-runtime-v01-20261116/sources');
mkdirSync(root, { recursive: true });
function fixture() {
  const directory = mkdtempSync(join(root, 'fixture-'));
  const store = new SentiStore({ filename: join(directory, 'business.sqlite') });
  const item = store.create(owner, { goal: '工程合同检查用持续目标', idempotencyKey: 'create' });
  const source = join(directory, 'authorized'); mkdirSync(source);
  const sources = new SourceStore(store, { owner, delegationId: item.id });
  return { directory, source, store, sources, item, close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
function grant(directory: string, overrides: Partial<SourceGrant> = {}): SourceGrant {
  return { sourceId: 'notes', directory, grantRevision: 1, enabled: true, ...overrides };
}
async function seed(f: ReturnType<typeof fixture>, options: Partial<SourceGrant> = {}) {
  writeFileSync(join(f.source, 'memo.md'), 'first synthetic revision');
  f.sources.configureGrants([grant(f.source, options)]);
  return (await f.sources.scan(() => {})).find((event) => event.kind === 'created')!.record!;
}

test('an authorized source supplies exact versioned text and duplicate checks do not create new events', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.source, 'memo.md'), '仅用于工程核对的原始资料');
    f.sources.configureGrants([{ sourceId: 'notes', directory: f.source, grantRevision: 1, enabled: true }]);
    const events = await f.sources.scan(() => {});
    const created = events.filter((event) => event.kind === 'created');
    assert.equal(created.length, 1);
    const record = created[0].record!;
    assert.equal(record.relativePath, 'memo.md');
    assert.match(record.hash, /^[0-9a-f]{64}$/);
    assert.equal((await f.sources.readExact(record.ref, record.hash)).text, '仅用于工程核对的原始资料');
    assert.equal(JSON.stringify(events).includes('仅用于工程核对的原始资料'), false);
    assert.deepEqual(await f.sources.scan(() => {}), []);
    assert.equal(f.sources.listReferences().length, 1);
  } finally { f.close(); }
});

test('ordinary exact reads and wrong caller hashes do not invalidate a current native session', async () => {
  const f = fixture();
  try {
    const record = await seed(f); const epoch = f.sources.qualificationEpoch();
    await assert.rejects(f.sources.readExact(record.ref, 'wrong-hash'), { code: 'hash_conflict' });
    assert.equal(f.sources.qualificationEpoch(), epoch);
    assert.equal((await f.sources.readExact(record.ref, record.hash)).text, 'first synthetic revision');
    assert.deepEqual(await f.sources.checkCurrent(record.ref), { available: true, grantRevision: 1, epoch });
    assert.equal(f.sources.qualificationEpoch(), epoch);
  } finally { f.close(); }
});

test('an Engine receive failure rolls source receipts, cursor and nested business writes back together', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.source, 'memo.md'), 'atomic synthetic input');
    f.sources.configureGrants([grant(f.source)]);
    f.store.connection.exec('CREATE TABLE fixture_engine_events (id TEXT PRIMARY KEY)');
    const epoch = f.sources.qualificationEpoch(); let attempted: SourceEvent | undefined;
    await assert.rejects(f.sources.scan((event) => {
      f.store.withTransaction(() => f.store.connection.prepare('INSERT INTO fixture_engine_events VALUES (?)').run(event.eventId));
      if (event.kind === 'created') { attempted = event; throw new Error('synthetic receive rejection'); }
    }), /synthetic receive rejection/);
    assert.deepEqual(f.sources.listReferences(), []);
    assert.equal(f.sources.coverage()[0].status, 'pending');
    assert.equal(f.sources.qualificationEpoch(), epoch);
    assert.deepEqual(f.store.connection.prepare('SELECT * FROM fixture_engine_events').all(), []);
    assert.equal((f.store.connection.prepare('SELECT count(*) AS n FROM source_events').get() as { n: number }).n, 0);
    const recovered = await f.sources.scan((event) => {
      f.store.withTransaction(() => f.store.connection.prepare('INSERT INTO fixture_engine_events VALUES (?)').run(event.eventId));
    });
    assert.equal(recovered.find((event) => event.kind === 'created')!.eventId, attempted!.eventId);
    assert.equal(f.sources.listReferences().length, 1);
    assert.deepEqual(await f.sources.scan(() => { throw new Error('duplicate delivery'); }), []);
  } finally { f.close(); }
});

test('default no-cache reads reject missing exact versions and preserve knowledge time separately', async () => {
  const f = fixture();
  try {
    const first = await seed(f); const before = f.sources.qualificationEpoch();
    writeFileSync(join(f.source, 'memo.md'), 'second synthetic revision');
    const missing = await f.sources.checkCurrent(first.ref);
    assert.equal(missing.available, false); assert.equal(missing.reason, 'version_missing');
    assert.ok(missing.epoch > before);
    await assert.rejects(f.sources.readExact(first.ref, first.hash), { code: 'version_missing' });
    assert.equal(f.sources.qualificationEpoch(), missing.epoch);
    const events = await f.sources.scan(() => {}); const second = events.find((event) => event.kind === 'updated')!.record!;
    assert.notEqual(second.ref, first.ref); assert.notEqual(second.hash, first.hash);
    assert.equal(second.version, second.hash); assert.ok(second.sourceModifiedAt); assert.ok(second.observedAt);
    assert.equal((await f.sources.readExact(second.ref, second.hash)).text, 'second synthetic revision');
    assert.deepEqual(f.store.connection.prepare('SELECT body FROM source_documents WHERE body IS NOT NULL').all(), []);
    rmSync(join(f.source, 'memo.md'));
    const deleted = await f.sources.scan(() => {});
    assert.equal(deleted.find((event) => event.kind === 'deleted')!.ref, second.ref);
    assert.deepEqual(f.sources.listReferences(), []);
    await assert.rejects(f.sources.readExact(second.ref, second.hash), { code: 'source_unavailable' });
    writeFileSync(join(f.source, 'memo.md'), 'second synthetic revision');
    const restored = (await f.sources.scan(() => {})).find((event) => event.kind === 'updated')!;
    assert.equal(restored.ref, second.ref); assert.notEqual(restored.eventId, events.find((event) => event.kind === 'updated')!.eventId);
    assert.deepEqual(await f.sources.scan(() => {}), []);
  } finally { f.close(); }
});

test('historical cache requires its own permission and revocation denies cached and in-flight reads', async () => {
  const f = fixture();
  try {
    const record = await seed(f, { cacheBody: true });
    writeFileSync(join(f.source, 'memo.md'), 'later synthetic revision');
    await assert.rejects(f.sources.readExact(record.ref, record.hash), { code: 'version_missing' });
    f.sources.configureGrants([grant(f.source, { grantRevision: 2, cacheBody: true, allowHistorical: true })]);
    await f.sources.scan(() => {});
    assert.equal((await f.sources.readExact(record.ref, record.hash)).text, 'first synthetic revision');
    const inFlight = f.sources.readExact(record.ref, record.hash);
    const priorEpoch = f.sources.qualificationEpoch();
    f.sources.configureGrants([grant(f.source, { grantRevision: 3, enabled: false, cacheBody: true, allowHistorical: true })]);
    await assert.rejects(inFlight, { code: 'source_grant_changed' });
    assert.ok(f.sources.qualificationEpoch() > priorEpoch);
    await assert.rejects(f.sources.readExact(record.ref, record.hash), { code: 'source_revoked' });
    assert.equal(f.sources.coverage()[0].status, 'revoked');
    assert.equal(f.store.get(owner, f.item.id).lifecycle, 'active');
    const revoked = await f.sources.scan(() => {});
    assert.deepEqual(revoked.map((event) => event.kind), ['grant_changed']);
    assert.deepEqual(await f.sources.scan(() => {}), []);
    assert.throws(() => f.sources.configureGrants([grant(f.source, { grantRevision: 3 })]), { code: 'stale_source_grant' });
  } finally { f.close(); }
});

test('loss and restoration emit bounded coverage events while independent sources keep flowing', async () => {
  const f = fixture();
  try {
    const record = await seed(f); const prior = f.sources.qualificationEpoch();
    const other = join(f.directory, 'second-authorized'); mkdirSync(other);
    writeFileSync(join(other, 'report.csv'), 'field,value\nsynthetic,1');
    f.sources.configureGrants([grant(f.source), grant(other, { sourceId: 'other' })]);
    renameSync(f.source, `${f.source}-temporarily-offline`);
    const events = await f.sources.scan(() => {});
    assert.equal(events.filter((event) => event.kind === 'unavailable' && event.sourceId === 'notes').length, 1);
    assert.equal(events.filter((event) => event.kind === 'created' && event.sourceId === 'other').length, 1);
    assert.equal(f.sources.coverage().find((source) => source.sourceId === 'notes')!.status, 'unavailable');
    assert.ok(f.sources.qualificationEpoch() > prior);
    await assert.rejects(f.sources.readExact(record.ref, record.hash), { code: 'source_unavailable' });
    const epoch = f.sources.qualificationEpoch();
    assert.deepEqual(await f.sources.scan(() => {}), []); assert.equal(f.sources.qualificationEpoch(), epoch);
    renameSync(`${f.source}-temporarily-offline`, f.source);
    assert.deepEqual((await f.sources.scan(() => {})).map((event) => event.kind), ['restored']);
    assert.equal((await f.sources.readExact(record.ref, record.hash)).text, 'first synthetic revision');
    assert.equal(f.store.get(owner, f.item.id).lifecycle, 'active');
  } finally { f.close(); }
});

test('scan rejects async receivers before invoking them and rejects returned thenables atomically', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.source, 'memo.md'), 'bounded input'); f.sources.configureGrants([grant(f.source)]);
    let called = false;
    await assert.rejects(f.sources.scan(async () => { called = true; }), { code: 'async_source_callback' });
    assert.equal(called, false);
    await assert.rejects(f.sources.scan(() => Promise.resolve()), { code: 'async_source_callback' });
    assert.deepEqual(f.sources.listReferences(), []);
    assert.equal(f.sources.coverage()[0].status, 'pending');
  } finally { f.close(); }
});

test('UTF-8 allowlist, total byte and file limits reject partial snapshots without exposing text', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.source, 'a.md'), '1234'); writeFileSync(join(f.source, 'b.txt'), '5678');
    f.sources.configureGrants([grant(f.source, { maxBytes: 6 })]);
    const overBytes = await f.sources.scan(() => {});
    assert.equal(overBytes.find((event) => event.kind === 'unavailable')!.reason, 'source_limit');
    assert.deepEqual(f.sources.listReferences(), []);
    f.sources.configureGrants([grant(f.source, { grantRevision: 2, maxFiles: 1 })]);
    assert.equal((await f.sources.scan(() => {})).find((event) => event.kind === 'unavailable')!.reason, 'source_limit');
    rmSync(join(f.source, 'b.txt')); writeFileSync(join(f.source, 'bad.json'), Buffer.from([0xc3, 0x28]));
    f.sources.configureGrants([grant(f.source, { grantRevision: 3 })]);
    assert.equal((await f.sources.scan(() => {})).find((event) => event.kind === 'unavailable')!.reason, 'invalid_utf8');
    rmSync(join(f.source, 'bad.json')); writeFileSync(join(f.source, 'binary.pdf'), 'ignored'); writeFileSync(join(f.source, '.private.md'), 'hidden');
    const events = await f.sources.scan(() => {});
    assert.deepEqual(events.filter((event) => event.kind === 'created').map((event) => event.record!.relativePath), ['a.md']);
    assert.equal(events.some((event) => Object.hasOwn(event, 'text') || Object.hasOwn(event.record ?? {}, 'text')), false);
    assert.equal(JSON.stringify(events).includes(f.source), false);
  } finally { f.close(); }
});

test('realpath rejects escaping symlinks and an authorized root cannot silently retarget', async () => {
  const f = fixture();
  try {
    const outside = join(f.directory, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'memo.md'), 'outside synthetic text');
    symlinkSync(join(outside, 'memo.md'), join(f.source, 'escape.md'));
    f.sources.configureGrants([grant(f.source)]);
    assert.equal((await f.sources.scan(() => {})).find((event) => event.kind === 'unavailable')!.reason, 'source_escape');
    assert.deepEqual(f.sources.listReferences(), []);
    rmSync(join(f.source, 'escape.md')); writeFileSync(join(f.source, 'memo.md'), 'inside synthetic text');
    await f.sources.scan(() => {}); const record = f.sources.listReferences()[0];
    renameSync(f.source, `${f.source}-original`); symlinkSync(outside, f.source);
    await assert.rejects(f.sources.readExact(record.ref, record.hash), { code: 'source_unavailable' });
    assert.equal((await f.sources.scan(() => {})).find((event) => event.kind === 'unavailable')!.reason, 'source_root_changed');
    assert.equal(f.sources.listReferences().length, 1);
    f.sources.configureGrants([grant(f.source, { grantRevision: 2 })]);
    await f.sources.scan(() => {});
    assert.equal((await f.sources.readExact(f.sources.listReferences()[0].ref, f.sources.listReferences()[0].hash)).text, 'outside synthetic text');
  } finally { f.close(); }
});

test('protected product output roots cannot be used as an external source', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.source, 'report.md'), 'generated synthetic result');
    const sources = new SourceStore(f.store, { owner, delegationId: f.item.id }, { protectedDirectories: [f.source] });
    sources.configureGrants([grant(f.source)]);
    assert.equal((await sources.scan(() => {})).find((event) => event.kind === 'unavailable')!.reason, 'source_escape');
    assert.deepEqual(sources.listReferences(), []);
  } finally { f.close(); }
});

test('a failed multi-record receive rolls back the whole batch and cold reopen replays it once', async () => {
  const f = fixture(); let reopened: SentiStore | undefined;
  try {
    writeFileSync(join(f.source, 'page-1.md'), 'first page'); writeFileSync(join(f.source, 'page-2.md'), 'second page');
    f.sources.configureGrants([grant(f.source)]);
    const attempted: SourceEvent[] = [];
    await assert.rejects(f.sources.scan(event => {
      if (event.kind !== 'created') return;
      attempted.push(event);
      if (event.record?.relativePath === 'page-2.md') throw new Error('interrupted batch receive');
    }), /interrupted batch receive/);
    assert.equal(attempted.length, 2);
    assert.equal((f.store.connection.prepare('SELECT count(*) AS n FROM source_events').get() as { n: number }).n, 0);
    assert.equal((f.store.connection.prepare('SELECT count(*) AS n FROM source_cursors').get() as { n: number }).n, 0);
    f.store.close(); reopened = new SentiStore({ filename: join(f.directory, 'business.sqlite') });
    const sources = new SourceStore(reopened, { owner, delegationId: f.item.id });
    const recovered = (await sources.scan(() => {})).filter(event => event.kind === 'created');
    assert.deepEqual(recovered.map(event => event.eventId), attempted.map(event => event.eventId));
    assert.deepEqual(await sources.scan(() => { throw new Error('duplicate page delivery'); }), []);
  } finally { if (reopened) { reopened.close(); rmSync(f.directory, { recursive: true, force: true }); } else f.close(); }
});

test('shared acquisition still revalidates each delegation source root anchor', async () => {
  const f = fixture();
  try {
    const other = f.store.create(owner, { goal: '独立授权核对', idempotencyKey: 'other' });
    const otherSources = new SourceStore(f.store, { owner, delegationId: other.id });
    const first = join(f.directory, 'first-root'), second = join(f.directory, 'second-root'), current = join(f.directory, 'current-root');
    mkdirSync(first); mkdirSync(second); writeFileSync(join(first, 'memo.md'), 'first root'); writeFileSync(join(second, 'memo.md'), 'second root');
    symlinkSync(first, current);
    for (const sources of [f.sources, otherSources]) { sources.configureGrants([grant(current)]); await sources.scan(() => {}); }
    rmSync(current); symlinkSync(second, current);
    f.sources.configureGrants([grant(current, { grantRevision: 2 })]);
    const cycle = SourceStore.createCollectionCycle();
    await f.sources.scan(() => {}, cycle); await otherSources.scan(() => {}, cycle);
    assert.equal(f.sources.coverage()[0].status, 'ready');
    assert.equal(otherSources.coverage()[0].status, 'unavailable');
    assert.equal(otherSources.coverage()[0].reason, 'source_root_changed');
    assert.equal(otherSources.listReferences().some(record => record.hash === f.sources.listReferences()[0]?.hash), false);
  } finally { f.close(); }
});

test('owner and delegation bindings survive reopening and inactive delegations do not scan or read', async () => {
  const f = fixture(); let reopened: SentiStore | undefined;
  try {
    const record = await seed(f); const epoch = f.sources.qualificationEpoch();
    const another = f.store.create(owner, { goal: '另一个合成委托', idempotencyKey: 'another' });
    const anotherSources = new SourceStore(f.store, { owner, delegationId: another.id });
    await assert.rejects(anotherSources.readExact(record.ref, record.hash), { code: 'source_not_found' });
    assert.throws(() => new SourceStore(f.store, { owner: { ...owner, principalId: 'unrelated' }, delegationId: f.item.id }), { code: 'not_found' });
    f.store.close(); reopened = new SentiStore({ filename: join(f.directory, 'business.sqlite') });
    const sources = new SourceStore(reopened, { owner, delegationId: f.item.id });
    assert.equal(sources.qualificationEpoch(), epoch); assert.deepEqual(await sources.scan(() => {}), []);
    assert.equal((await sources.readExact(record.ref, record.hash)).text, 'first synthetic revision');
    reopened.requestLifecycle(owner, f.item.id, { action: 'pause', expectedVersion: f.item.version, idempotencyKey: 'pause' });
    writeFileSync(join(f.source, 'memo.md'), 'changed while inactive');
    assert.deepEqual(await sources.scan(() => { throw new Error('inactive source delivery'); }), []);
    await assert.rejects(sources.readExact(record.ref, record.hash), { code: 'delegation_inactive' });
    assert.equal(reopened.get(owner, f.item.id).lifecycle, 'pausing');
  } finally { if (reopened) { reopened.close(); rmSync(f.directory, { recursive: true, force: true }); } else f.close(); }
});
