import { createHash } from 'node:crypto';
import { readdir, realpath, stat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute, extname, sep } from 'node:path';
import { StoreError } from './domain.ts';
import type { Owner } from './domain.ts';
import type { SentiStore } from './store.ts';

export interface SourceGrant {
  sourceId: string; directory: string; grantRevision: number; enabled: boolean;
  cacheBody?: boolean; allowHistorical?: boolean; maxFiles?: number; maxBytes?: number;
}
export interface SourceRecord {
  ref: string; sourceId: string; relativePath: string; version: string; hash: string; bytes: number;
  sourceModifiedAt: string; observedAt: string; grantRevision: number;
}
export interface SourceEvent {
  eventId: string; kind: 'created' | 'updated' | 'deleted' | 'grant_changed' | 'unavailable' | 'restored';
  sourceId: string; ref: string | null; record: SourceRecord | null; grantRevision: number;
  observedAt: string; reason?: string;
}
export interface SourceQualification { available: boolean; reason?: string; grantRevision: number; epoch: number }
export interface SourceScanContext { readonly qualificationEpoch: number }
export interface SourceCoverage {
  sourceId: string; status: 'pending' | 'ready' | 'unavailable' | 'revoked'; grantRevision: number;
  lastCheckedAt: string | null; reason: string | null;
}
type NormalGrant = Required<SourceGrant>;
interface GrantRow { source_id: string; config: string; status: SourceCoverage['status']; checked_at: string | null; reason: string | null; revision: number; config_pending: number }
interface Cursor { path: string; ref: string; hash: string; state: 'present' | 'deleted'; revision: number }
interface FileFact { path: string; hash: string; bytes: number; modifiedAt: string; text: string }
interface Snapshot { grant: NormalGrant; files: FileFact[]; root?: string; reason?: string }
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const allowed = new Set(['.txt', '.md', '.json', '.csv']);
const isInside = (root: string, target: string) => { const part = relative(root, target); return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part); };

/** Host-owned source access. No watcher, timer, network access, or research judgement. */
export class SourceStore {
  readonly #store: SentiStore;
  readonly #binding: { owner: Owner; delegationId: string };
  readonly #ns: string;
  readonly #protected: readonly string[];
  constructor(store: SentiStore, binding: { owner: Owner; delegationId: string }, options: { protectedDirectories?: readonly string[] } = {}) {
    store.get(binding.owner, binding.delegationId);
    this.#store = store;
    this.#binding = { owner: Object.freeze({ ...binding.owner }), delegationId: binding.delegationId };
    this.#ns = hash(JSON.stringify([binding.owner.enterpriseId, binding.owner.principalId, binding.delegationId]));
    this.#protected = (options.protectedDirectories ?? []).map((path) => resolve(path));
    store.connection.exec(`
      CREATE TABLE IF NOT EXISTS source_scopes (namespace TEXT PRIMARY KEY, grants_epoch INTEGER NOT NULL, qualification_epoch INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS source_grants (namespace TEXT NOT NULL, source_id TEXT NOT NULL, config TEXT NOT NULL,
        status TEXT NOT NULL, checked_at TEXT, reason TEXT, revision INTEGER NOT NULL, config_pending INTEGER NOT NULL,
        PRIMARY KEY(namespace,source_id));
      CREATE TABLE IF NOT EXISTS source_documents (namespace TEXT NOT NULL, ref TEXT NOT NULL, metadata TEXT NOT NULL, body TEXT,
        PRIMARY KEY(namespace,ref));
      CREATE TABLE IF NOT EXISTS source_cursors (namespace TEXT NOT NULL, source_id TEXT NOT NULL, path TEXT NOT NULL,
        ref TEXT NOT NULL, hash TEXT NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(namespace,source_id,path));
      CREATE TABLE IF NOT EXISTS source_events (namespace TEXT NOT NULL,event_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(namespace,event_id));
      CREATE TABLE IF NOT EXISTS source_qualification_observations (namespace TEXT NOT NULL,ref TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(namespace,ref));
      CREATE TABLE IF NOT EXISTS source_roots (namespace TEXT NOT NULL,source_id TEXT NOT NULL,grant_revision INTEGER NOT NULL,root TEXT NOT NULL,PRIMARY KEY(namespace,source_id));
    `);
    store.connection.prepare('INSERT OR IGNORE INTO source_scopes VALUES (?,0,0)').run(this.#ns);
  }
  #scope() { return this.#store.scope(this.#binding.owner, this.#binding.delegationId); }
  #rows(): GrantRow[] { return this.#store.connection.prepare('SELECT * FROM source_grants WHERE namespace=? ORDER BY source_id').all(this.#ns) as unknown as GrantRow[]; }
  #grant(sourceId: string): { grant: NormalGrant; row: GrantRow } | undefined {
    const row = this.#store.connection.prepare('SELECT * FROM source_grants WHERE namespace=? AND source_id=?').get(this.#ns, sourceId) as unknown as GrantRow | undefined;
    return row ? { grant: JSON.parse(row.config) as NormalGrant, row } : undefined;
  }
  #normal(input: SourceGrant): NormalGrant {
    if (!input || typeof input.sourceId !== 'string' || !input.sourceId.trim() || typeof input.directory !== 'string' || !input.directory.trim()
      || !Number.isSafeInteger(input.grantRevision) || input.grantRevision < 1 || typeof input.enabled !== 'boolean') throw new StoreError('invalid_source_grant', '来源授权字段无效。');
    const maxFiles = input.maxFiles ?? 100; const maxBytes = input.maxBytes ?? 262144;
    if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 1000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576
      || (input.cacheBody !== undefined && typeof input.cacheBody !== 'boolean') || (input.allowHistorical !== undefined && typeof input.allowHistorical !== 'boolean')) throw new StoreError('invalid_source_grant', '来源资源或缓存授权无效。');
    return { sourceId: input.sourceId, directory: resolve(input.directory), grantRevision: input.grantRevision, enabled: input.enabled,
      cacheBody: input.cacheBody ?? false, allowHistorical: input.allowHistorical ?? false, maxFiles, maxBytes };
  }
  /** Host-only configuration, not an Agent tool. Removing a grant is a revocation. */
  configureGrants(inputs: readonly SourceGrant[]): void {
    this.#scope(); const grants = inputs.map((input) => this.#normal(input));
    if (new Set(grants.map((grant) => grant.sourceId)).size !== grants.length) throw new StoreError('invalid_source_grant', '来源标识不能重复。');
    this.#store.withTransaction(() => {
      let changed = false; const prior = this.#rows();
      for (const row of prior) if (!grants.some((grant) => grant.sourceId === row.source_id)) {
        const old = JSON.parse(row.config) as NormalGrant;
        grants.push(old.enabled ? { ...old, enabled: false, grantRevision: old.grantRevision + 1 } : old);
      }
      for (const grant of grants) {
        const old = prior.find((row) => row.source_id === grant.sourceId); const config = JSON.stringify(grant);
        if (old?.config === config) continue;
        if (old && grant.grantRevision <= (JSON.parse(old.config) as NormalGrant).grantRevision) throw new StoreError('stale_source_grant', '来源授权变化必须使用新的授权修订。', 409);
        this.#store.connection.prepare(`INSERT INTO source_grants VALUES (?,?,?,?,NULL,NULL,0,1)
          ON CONFLICT(namespace,source_id) DO UPDATE SET config=excluded.config,status=excluded.status,reason=NULL,config_pending=1`).run(this.#ns, grant.sourceId, config, grant.enabled ? 'pending' : 'revoked');
        changed = true;
      }
      if (changed) this.#store.connection.prepare('UPDATE source_scopes SET grants_epoch=grants_epoch+1,qualification_epoch=qualification_epoch+1 WHERE namespace=?').run(this.#ns);
    });
  }
  grantsRevision(): number { this.#scope(); return (this.#store.connection.prepare('SELECT grants_epoch AS n FROM source_scopes WHERE namespace=?').get(this.#ns) as { n: number }).n; }
  qualificationEpoch(): number { this.#scope(); return (this.#store.connection.prepare('SELECT qualification_epoch AS n FROM source_scopes WHERE namespace=?').get(this.#ns) as { n: number }).n; }
  #bump() { this.#store.connection.prepare('UPDATE source_scopes SET qualification_epoch=qualification_epoch+1 WHERE namespace=?').run(this.#ns); }
  coverage(): SourceCoverage[] {
    this.#scope(); return this.#rows().map((row) => ({ sourceId: row.source_id, status: row.status, grantRevision: (JSON.parse(row.config) as NormalGrant).grantRevision, lastCheckedAt: row.checked_at, reason: row.reason }));
  }
  listReferences(): SourceRecord[] {
    this.#scope();
    return (this.#store.connection.prepare(`SELECT d.metadata FROM source_documents d JOIN source_cursors c ON c.namespace=d.namespace AND c.ref=d.ref
      WHERE d.namespace=? AND c.state='present' ORDER BY c.source_id,c.path`).all(this.#ns) as { metadata: string }[]).map((row) => JSON.parse(row.metadata) as SourceRecord);
  }
  async #root(grant: NormalGrant): Promise<string> {
    const root = await realpath(grant.directory);
    const anchor = this.#store.connection.prepare('SELECT grant_revision,root FROM source_roots WHERE namespace=? AND source_id=?').get(this.#ns, grant.sourceId) as { grant_revision: number; root: string } | undefined;
    if (anchor?.grant_revision === grant.grantRevision && anchor.root !== root) throw new StoreError('source_root_changed', '来源根已改变，需新的Host授权修订。', 403);
    const protectedRoots = await Promise.all(this.#protected.map((path) => realpath(path).catch(() => path)));
    if (protectedRoots.some((protectedRoot) => isInside(root, protectedRoot) || isInside(protectedRoot, root))) throw new StoreError('source_escape', '来源根与受保护运行目录重叠。', 403);
    return root;
  }
  async #readPath(grant: NormalGrant, path: string): Promise<FileFact> {
    const root = await this.#root(grant); const target = await realpath(resolve(root, path));
    if (!isInside(root, target) || this.#protected.some((protectedRoot) => isInside(protectedRoot, target))) throw new StoreError('source_escape', '来源路径超出获准范围。', 403);
    const expected = await stat(target); const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (expected.dev !== before.dev || expected.ino !== before.ino) throw new StoreError('source_changed', '资料在打开期间发生变化。', 409);
      if (!before.isFile() || before.size > grant.maxBytes) throw new StoreError('source_limit', '来源文件不符合大小或类型约束。');
      const buffer = Buffer.alloc(grant.maxBytes + 1); let size = 0;
      while (size < buffer.length) {
        const result = await handle.read(buffer, size, buffer.length - size, size);
        if (!result.bytesRead) break; size += result.bytesRead;
      }
      if (size > grant.maxBytes) throw new StoreError('source_limit', '来源文件超过读取上限。');
      const bytes = buffer.subarray(0, size); const after = await handle.stat();
      const finalRoot = await this.#root(grant); const finalTarget = await realpath(resolve(finalRoot, path)); const current = await stat(finalTarget);
      if (root !== finalRoot || target !== finalTarget || !isInside(finalRoot, finalTarget) || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || current.dev !== after.dev || current.ino !== after.ino || size !== after.size) throw new StoreError('source_changed', '资料在读取期间发生变化，请重新核对。', 409);
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new StoreError('invalid_utf8', '来源不是受支持的UTF-8文本。'); }
      return { path, hash: hash(bytes), bytes: size, modifiedAt: after.mtime.toISOString(), text };
    } finally { await handle.close(); }
  }
  async #snapshot(grant: NormalGrant): Promise<Snapshot> {
    if (!grant.enabled) return { grant, files: [] };
    try {
      const root = await this.#root(grant);
      if (!(await stat(root)).isDirectory()) throw new StoreError('source_unavailable', '获准来源不是目录。');
      const files: FileFact[] = []; const visited = new Set<string>(); let entriesSeen = 0; let bytesSeen = 0;
      const walk = async (directory: string): Promise<void> => {
        const actual = await realpath(directory);
        if (!isInside(root, actual)) throw new StoreError('source_escape', '来源软链接越过获准根。', 403);
        if (visited.has(actual)) return; visited.add(actual);
        for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
          entriesSeen += 1;
          if (entriesSeen > grant.maxFiles * 20 + 100) throw new StoreError('source_limit', '来源目录条目超过资源上限。');
          if (entry.name.startsWith('.')) continue;
          const pathname = resolve(directory, entry.name); const actualEntry = await realpath(pathname);
          if (!isInside(root, actualEntry)) throw new StoreError('source_escape', '来源软链接越过获准根。', 403);
          const info = await stat(actualEntry);
          if (info.isDirectory()) { await walk(pathname); continue; }
          if (!info.isFile() || !allowed.has(extname(entry.name).toLowerCase())) continue;
          if (files.length >= grant.maxFiles) throw new StoreError('source_limit', '来源文件数量超过资源上限。');
          const file = await this.#readPath(grant, relative(root, pathname).split(sep).join('/'));
          bytesSeen += file.bytes;
          if (bytesSeen > grant.maxBytes) throw new StoreError('source_limit', '来源累计正文超过读取上限。');
          files.push(file);
        }
      };
      await walk(root); return { grant, files, root };
    } catch (error) { return { grant, files: [], reason: error instanceof StoreError ? error.code : 'source_unavailable' }; }
  }
  async scan(onRecord: (event: SourceEvent, context: SourceScanContext) => void): Promise<SourceEvent[]> {
    if (onRecord.constructor.name === 'AsyncFunction') throw new StoreError('async_source_callback', '来源接收回调必须同步提交。');
    if (this.#scope().lifecycle !== 'active') return [];
    const epoch = this.grantsRevision(); const snapshots = await Promise.all(this.#rows().map((row) => this.#snapshot(JSON.parse(row.config) as NormalGrant)));
    return this.#store.withTransaction(() => {
      if (this.#scope().lifecycle !== 'active' || this.grantsRevision() !== epoch) throw new StoreError('source_grant_changed', '扫描期间委托或来源授权已变化。', 409);
      const events: SourceEvent[] = []; const at = new Date().toISOString();
      const context:SourceScanContext=Object.freeze({qualificationEpoch:this.qualificationEpoch()});
      const emit = (event: SourceEvent) => {
        this.#store.connection.prepare('INSERT INTO source_events VALUES (?,?,?)').run(this.#ns, event.eventId, JSON.stringify(event));
        const result = onRecord(structuredClone(event),context) as unknown;
        if (result && typeof (result as { then?: unknown }).then === 'function') {
          void Promise.resolve(result).catch(() => {}); throw new StoreError('async_source_callback', '来源接收回调必须同步提交。');
        }
        events.push(event); this.#bump();
      };
      for (const snapshot of snapshots) {
        const { grant, files, reason } = snapshot; const current = this.#grant(grant.sourceId)!; const row = current.row;
        const status: SourceCoverage['status'] = !grant.enabled ? 'revoked' : reason ? 'unavailable' : 'ready';
        const revision = row.revision + 1;
        const stateEvent = (kind: SourceEvent['kind'], why?: string): SourceEvent => ({ eventId: hash(JSON.stringify([this.#ns, grant.sourceId, 'state', revision, kind])), kind, sourceId: grant.sourceId, ref: null, record: null, grantRevision: grant.grantRevision, observedAt: at, ...(why ? { reason: why } : {}) });
        if (row.config_pending) emit(stateEvent('grant_changed', grant.enabled ? 'grant_configured' : 'source_revoked'));
        if (status === 'unavailable' && (row.status !== status || row.reason !== reason)) emit(stateEvent('unavailable', reason));
        if (status === 'ready' && row.status === 'unavailable') emit(stateEvent('restored'));
        this.#store.connection.prepare('UPDATE source_grants SET status=?,checked_at=?,reason=?,revision=?,config_pending=0 WHERE namespace=? AND source_id=?').run(status, at, reason ?? null, revision, this.#ns, grant.sourceId);
        if (status !== 'ready') continue;
        this.#store.connection.prepare('INSERT INTO source_roots VALUES (?,?,?,?) ON CONFLICT(namespace,source_id) DO UPDATE SET grant_revision=excluded.grant_revision,root=excluded.root').run(this.#ns, grant.sourceId, grant.grantRevision, snapshot.root!);
        const cursors = this.#store.connection.prepare('SELECT path,ref,hash,state,revision FROM source_cursors WHERE namespace=? AND source_id=?').all(this.#ns, grant.sourceId) as unknown as Cursor[];
        for (const file of files) {
          const prior = cursors.find((cursor) => cursor.path === file.path);
          if (prior?.state === 'present' && prior.hash === file.hash) continue;
          const ref = `src-${hash(JSON.stringify([this.#ns, grant.sourceId, file.path, file.hash]))}`;
          const record: SourceRecord = { ref, sourceId: grant.sourceId, relativePath: file.path, version: file.hash, hash: file.hash, bytes: file.bytes, sourceModifiedAt: file.modifiedAt, observedAt: at, grantRevision: grant.grantRevision };
          this.#store.connection.prepare('INSERT INTO source_documents VALUES (?,?,?,?) ON CONFLICT(namespace,ref) DO NOTHING').run(this.#ns, ref, JSON.stringify(record), grant.cacheBody ? file.text : null);
          const next = (prior?.revision ?? 0) + 1;
          this.#store.connection.prepare(`INSERT INTO source_cursors VALUES (?,?,?,?,?,'present',?) ON CONFLICT(namespace,source_id,path) DO UPDATE SET ref=excluded.ref,hash=excluded.hash,state='present',revision=excluded.revision`).run(this.#ns, grant.sourceId, file.path, ref, file.hash, next);
          emit({ eventId: hash(JSON.stringify([this.#ns, grant.sourceId, file.path, next, 'present', file.hash])), kind: prior ? 'updated' : 'created', sourceId: grant.sourceId, ref, record, grantRevision: grant.grantRevision, observedAt: at });
        }
        for (const prior of cursors) if (prior.state === 'present' && !files.some((file) => file.path === prior.path)) {
          this.#store.connection.prepare("UPDATE source_cursors SET state='deleted',revision=revision+1 WHERE namespace=? AND source_id=? AND path=?").run(this.#ns, grant.sourceId, prior.path);
          emit({ eventId: hash(JSON.stringify([this.#ns, grant.sourceId, prior.path, prior.revision + 1, 'deleted'])), kind: 'deleted', sourceId: grant.sourceId, ref: prior.ref, record: this.#record(prior.ref), grantRevision: grant.grantRevision, observedAt: at });
        }
      }
      return structuredClone(events);
    });
  }
  #record(ref: string): SourceRecord {
    this.#scope(); const row = this.#store.connection.prepare('SELECT metadata FROM source_documents WHERE namespace=? AND ref=?').get(this.#ns, ref) as { metadata: string } | undefined;
    if (!row) throw new StoreError('source_not_found', '未找到当前委托可引用的资料。', 404);
    return JSON.parse(row.metadata) as SourceRecord;
  }
  #observe(ref: string, reason: string) {
    this.#store.withTransaction(() => {
      const row = this.#store.connection.prepare('SELECT reason FROM source_qualification_observations WHERE namespace=? AND ref=?').get(this.#ns, ref) as { reason: string } | undefined;
      if (row?.reason === reason) return;
      this.#store.connection.prepare('INSERT INTO source_qualification_observations VALUES (?,?,?) ON CONFLICT(namespace,ref) DO UPDATE SET reason=excluded.reason').run(this.#ns, ref, reason);
      if (row || reason !== 'available') this.#bump();
    });
  }
  async #access(ref: string, expectedHash?: string): Promise<{ record: SourceRecord; text: string }> {
    const record = this.#record(ref); const initial = this.#grant(record.sourceId)!;
    const reject = (reason: string): never => { this.#observe(ref, reason); throw new StoreError(reason, '当前资料资格或准确版本不可用。', reason === 'source_revoked' ? 403 : 409); };
    if (this.#scope().lifecycle !== 'active') return reject('delegation_inactive');
    if (!initial.grant.enabled) return reject('source_revoked');
    if (initial.row.status !== 'ready') return reject('source_unavailable');
    if (expectedHash !== undefined && record.hash !== expectedHash) throw new StoreError('hash_conflict', '引用与所请求的准确版本不一致。', 409);
    const epoch = this.grantsRevision(); const qualification = this.qualificationEpoch(); let file: FileFact;
    try { file = await this.#readPath(initial.grant, record.relativePath); }
    catch { return reject('source_unavailable'); }
    const now = this.#grant(record.sourceId)!;
    if (this.#scope().lifecycle !== 'active' || this.grantsRevision() !== epoch || now.grant.grantRevision !== initial.grant.grantRevision || !now.grant.enabled) return reject('source_grant_changed');
    if (now.row.status !== 'ready' || this.qualificationEpoch() !== qualification) return reject('source_qualification_changed');
    if (file.hash === record.hash) { this.#observe(ref, 'available'); return { record, text: file.text }; }
    if (now.grant.cacheBody && now.grant.allowHistorical) {
      const cached = this.#store.connection.prepare('SELECT body FROM source_documents WHERE namespace=? AND ref=?').get(this.#ns, ref) as { body: string | null };
      if (cached.body !== null) { this.#observe(ref, 'available'); return { record, text: cached.body }; }
    }
    return reject('version_missing');
  }
  async checkCurrent(ref: string): Promise<SourceQualification> {
    try { const result = await this.#access(ref); return { available: true, grantRevision: this.#grant(result.record.sourceId)!.grant.grantRevision, epoch: this.qualificationEpoch() }; }
    catch (error) {
      if (!(error instanceof StoreError) || error.code === 'source_not_found') throw error;
      const record = this.#record(ref); return { available: false, reason: error.code, grantRevision: this.#grant(record.sourceId)!.grant.grantRevision, epoch: this.qualificationEpoch() };
    }
  }
  async readExact(ref: string, expectedHash: string): Promise<{ record: SourceRecord; text: string }> { return this.#access(ref, expectedHash); }
}
