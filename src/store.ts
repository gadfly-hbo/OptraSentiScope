import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { StoreError } from './domain.ts';
import type {
  Owner, Delegation, GoalRevision, Activity, OperatorMessage,
  CreateDelegation, PendingOperation, Lifecycle, AdjustDelegation, LifecycleRequest, LifecycleReceipt, MessageInput,
} from './domain.ts';

interface DelegationRow {
  id: string;
  enterprise_id: string;
  principal_id: string;
  goal: string;
  boundary: string;
  related_to: string | null;
  version: number;
  goal_revision: number;
  lifecycle: Lifecycle;
  pending_operation: string | null;
  created_at: string;
  updated_at: string;
}

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS delegations (
    id TEXT PRIMARY KEY, enterprise_id TEXT NOT NULL, principal_id TEXT NOT NULL,
    goal TEXT NOT NULL, boundary TEXT NOT NULL, related_to TEXT REFERENCES delegations(id),
    version INTEGER NOT NULL, goal_revision INTEGER NOT NULL, lifecycle TEXT NOT NULL,
    pending_operation TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS delegations_owner ON delegations(enterprise_id, principal_id);
  CREATE TABLE IF NOT EXISTS delegation_revisions (
    delegation_id TEXT NOT NULL REFERENCES delegations(id), revision INTEGER NOT NULL,
    goal TEXT NOT NULL, boundary TEXT NOT NULL, original_goal TEXT NOT NULL,
    original_boundary TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (delegation_id, revision)
  );
  CREATE TABLE IF NOT EXISTS command_receipts (
    enterprise_id TEXT NOT NULL, principal_id TEXT NOT NULL, key TEXT NOT NULL,
    request_hash TEXT NOT NULL, delegation_id TEXT NOT NULL REFERENCES delegations(id),
    PRIMARY KEY (enterprise_id, principal_id, key)
  );
  CREATE TABLE IF NOT EXISTS activity (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, delegation_id TEXT NOT NULL REFERENCES delegations(id),
    kind TEXT NOT NULL, created_at TEXT NOT NULL, detail TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS activity_delegation ON activity(delegation_id, seq);
  CREATE TABLE IF NOT EXISTS lifecycle_receipts (
    delegation_id TEXT NOT NULL REFERENCES delegations(id), request_hash TEXT NOT NULL,
    operation_id TEXT NOT NULL, expected_version INTEGER NOT NULL, outcome TEXT NOT NULL,
    evidence TEXT NOT NULL, accepted INTEGER NOT NULL, reason TEXT, created_at TEXT NOT NULL,
    PRIMARY KEY (delegation_id, request_hash)
  );
  CREATE TABLE IF NOT EXISTS operator_messages (
    id TEXT PRIMARY KEY, delegation_id TEXT NOT NULL REFERENCES delegations(id),
    text TEXT NOT NULL, created_at TEXT NOT NULL
  );
`;

/** Synchronous business persistence; never creates Agent, Session, Schedule, or Engine tickets. */
export class SentiStore {
  readonly #db: DatabaseSync;
  readonly #clock: () => string;
  #depth = 0;

  constructor(options: { filename: string; clock?: () => string }) {
    this.#db = new DatabaseSync(options.filename);
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#db.exec(schema);
  }

  /** Host-only adapter seam for official Repositories; never expose over HTTP or to an Agent. */
  get connection(): DatabaseSync { return this.#db; }

  close(): void { this.#db.close(); }

  withTransaction<T>(callback: () => T): T {
    if (callback.constructor.name === 'AsyncFunction') throw new StoreError('async_transaction', '业务事务回调必须同步执行。');
    const outer = this.#depth === 0;
    const savepoint = `senti_${this.#depth}`;
    this.#db.exec(outer ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.#depth += 1;
    try {
      const result = callback();
      if (result !== null && (typeof result === 'object' || typeof result === 'function') && typeof (result as { then?: unknown }).then === 'function') {
        // Observe a rejected promise to avoid an unhandled rejection; never await it in the transaction.
        void Promise.resolve(result).catch(() => {});
        throw new StoreError('async_transaction', '业务事务回调不能返回Promise或thenable。');
      }
      this.#db.exec(outer ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      this.#db.exec(outer ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${savepoint}`);
      if (!outer) this.#db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    } finally {
      this.#depth -= 1;
    }
  }

  list(owner: Owner): Delegation[] {
    this.#validateOwner(owner);
    const rows = this.#db.prepare('SELECT * FROM delegations WHERE enterprise_id = ? AND principal_id = ? ORDER BY created_at DESC, rowid DESC').all(owner.enterpriseId, owner.principalId) as unknown as DelegationRow[];
    return rows.map((row) => this.#view(row));
  }

  get(owner: Owner, id: string): Delegation {
    return this.#view(this.#owned(owner, id));
  }

  /** Scalar authorization view; stream guards do not load messages, history or artifacts per chunk. */
  scope(owner: Owner, id: string): Pick<Delegation,'id'|'version'|'goalRevision'|'lifecycle'> {
    this.#validateOwner(owner);this.#nonempty(id,'delegationId');
    const row=this.#db.prepare('SELECT id,version,goal_revision,lifecycle FROM delegations WHERE id=? AND enterprise_id=? AND principal_id=?').get(id,owner.enterpriseId,owner.principalId) as {id:string;version:number;goal_revision:number;lifecycle:Lifecycle}|undefined;
    if(!row)throw new StoreError('not_found','未找到当前身份可访问的委托。',404);
    return {id:row.id,version:row.version,goalRevision:row.goal_revision,lifecycle:row.lifecycle};
  }

  create(owner: Owner, input: CreateDelegation): Delegation {
    return this.createWithOutcome(owner, input).delegation;
  }

  createWithOutcome(owner: Owner, input: CreateDelegation): { delegation: Delegation; created: boolean } {
    this.#validateOwner(owner);
    const goal = this.#nonempty(input.goal, 'goal');
    const boundary = this.#optionalText(input.boundary, 'boundary');
    const key = this.#nonempty(input.idempotencyKey, 'idempotencyKey');
    const requestHash = this.#hash(['create', input.goal, input.boundary ?? '', input.relatedTo ?? null]);
    return this.withTransaction(() => {
      const existing = this.#replay(owner, key, requestHash);
      if (existing) return { delegation: this.get(owner, existing), created: false };
      if (input.relatedTo !== undefined) {
        const original = this.#owned(owner, input.relatedTo);
        if (original.lifecycle !== 'ended') throw new StoreError('conflict', '关联委托尚未结束。', 409);
      }
      const id = randomUUID();
      const at = this.#clock();
      this.#db.prepare('INSERT INTO delegations VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, NULL, ?, ?)').run(id, owner.enterpriseId, owner.principalId, goal, boundary, input.relatedTo ?? null, 'active', at, at);
      this.#db.prepare('INSERT INTO delegation_revisions VALUES (?, 1, ?, ?, ?, ?, ?)').run(id, goal, boundary, input.goal, input.boundary ?? '', at);
      this.#activity(id, 'delegation_created', at, { goalRevision: 1 });
      this.#remember(owner, key, requestHash, id);
      return { delegation: this.get(owner, id), created: true };
    });
  }

  adjust(owner: Owner, id: string, input: AdjustDelegation): Delegation {
    const goal = this.#nonempty(input.goal, 'goal');
    const boundary = this.#optionalText(input.boundary, 'boundary');
    const key = this.#nonempty(input.idempotencyKey, 'idempotencyKey');
    this.#validateVersion(input.expectedVersion);
    const requestHash = this.#hash(['adjust', id, input.expectedVersion, input.goal, input.boundary ?? '']);
    return this.withTransaction(() => {
      const replay = this.#replay(owner, key, requestHash);
      if (replay) return this.get(owner, replay);
      const row = this.#owned(owner, id);
      this.#matchingVersion(row, input.expectedVersion);
      if (!['active', 'paused'].includes(row.lifecycle)) throw new StoreError('conflict', '当前委托正在处理控制请求或已经结束。', 409);
      const at = this.#clock();
      const revision = row.goal_revision + 1;
      this.#db.prepare('INSERT INTO delegation_revisions VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, revision, goal, boundary, input.goal, input.boundary ?? '', at);
      this.#db.prepare('UPDATE delegations SET goal = ?, boundary = ?, version = version + 1, goal_revision = ?, updated_at = ? WHERE id = ?').run(goal, boundary, revision, at, id);
      this.#activity(id, 'delegation_adjusted', at, { goalRevision: revision, previousGoalRevision: row.goal_revision });
      this.#remember(owner, key, requestHash, id);
      return this.get(owner, id);
    });
  }

  requestLifecycle(owner: Owner, id: string, input: LifecycleRequest): Delegation {
    const key = this.#nonempty(input.idempotencyKey, 'idempotencyKey');
    this.#validateVersion(input.expectedVersion);
    if (!['pause', 'resume', 'end'].includes(input.action)) throw new StoreError('invalid_input', '未知委托操作。');
    const requestHash = this.#hash(['lifecycle', id, input.expectedVersion, input.action]);
    return this.withTransaction(() => {
      const replay = this.#replay(owner, key, requestHash);
      if (replay) return this.get(owner, replay);
      const row = this.#owned(owner, id);
      this.#matchingVersion(row, input.expectedVersion);
      const allowed = input.action === 'pause' ? row.lifecycle === 'active'
        : input.action === 'resume' ? row.lifecycle === 'paused'
          : ['active', 'paused', 'resuming'].includes(row.lifecycle);
      const supersedesRecovery = input.action === 'end' && row.lifecycle === 'resuming';
      if (!allowed || (row.pending_operation && !supersedesRecovery)) throw new StoreError('conflict', '当前生命周期不接受此操作。', 409);
      const at = this.#clock();
      const operation: PendingOperation = { id: randomUUID(), action: input.action, requestedVersion: row.version + 1, requestedAt: at, outcome: 'pending' };
      const state: Lifecycle = input.action === 'pause' ? 'pausing' : input.action === 'resume' ? 'resuming' : 'ending';
      this.#db.prepare('UPDATE delegations SET lifecycle = ?, pending_operation = ?, version = version + 1, updated_at = ? WHERE id = ?').run(state, JSON.stringify(operation), at, id);
      this.#activity(id, 'lifecycle_requested', at, { action: input.action, operationId: operation.id, requestedVersion: operation.requestedVersion });
      this.#remember(owner, key, requestHash, id);
      return this.get(owner, id);
    });
  }

  /** Host RuntimePort receipt only; an operator HTTP request is not proof of stopped resources. */
  completeLifecycle(owner: Owner, id: string, input: LifecycleReceipt): Delegation {
    this.#nonempty(input.operationId, 'operationId');
    this.#validateVersion(input.expectedVersion);
    const evidence = this.#nonempty(input.evidence, 'evidence');
    if (!['stopped', 'eligible', 'unavailable', 'unknown'].includes(input.outcome)) throw new StoreError('invalid_input', '未知运行回执。');
    const requestHash = this.#hash([input.operationId, input.expectedVersion, input.outcome, input.evidence]);
    const result = this.withTransaction(() => {
      const row = this.#owned(owner, id);
      const previous = this.#db.prepare('SELECT accepted, reason FROM lifecycle_receipts WHERE delegation_id = ? AND request_hash = ?').get(id, requestHash) as { accepted: number; reason: string | null } | undefined;
      if (previous) return previous.accepted ? this.get(owner, id) : new StoreError('invalid_receipt', previous.reason ?? '回执不匹配。', 409);
      const operation = row.pending_operation ? JSON.parse(row.pending_operation) as PendingOperation : null;
      const expectedState = operation?.action === 'pause' ? 'pausing' : operation?.action === 'resume' ? 'resuming' : 'ending';
      const matching = operation && operation.id === input.operationId
        && operation.requestedVersion === input.expectedVersion && row.lifecycle === expectedState;
      const compatible = input.outcome === 'unknown' || (['eligible', 'unavailable'].includes(input.outcome) ? operation?.action === 'resume' : operation?.action !== 'resume');
      const at = this.#clock();
      if (!matching || !compatible) {
        const reason = '回执与当前操作、请求版本或生命周期不匹配；当前状态未改变。';
        this.#saveLifecycleReceipt(id, requestHash, input, at, false, reason);
        this.#activity(id, 'lifecycle_receipt_rejected', at, { operationId: input.operationId, expectedVersion: input.expectedVersion, outcome: input.outcome, reason });
        return new StoreError('invalid_receipt', reason, 409);
      }
      this.#saveLifecycleReceipt(id, requestHash, input, at, true, null);
      if (input.outcome === 'unknown') {
        this.#db.prepare('UPDATE delegations SET pending_operation = ?, version = version + 1, updated_at = ? WHERE id = ?').run(JSON.stringify({ ...operation, outcome: 'unknown' }), at, id);
        this.#activity(id, 'lifecycle_unknown', at, { action: operation.action, operationId: operation.id, evidence });
      } else {
        const state = input.outcome === 'unavailable' || operation.action === 'pause' ? 'paused' : operation.action === 'end' ? 'ended' : 'active';
        this.#db.prepare('UPDATE delegations SET lifecycle = ?, pending_operation = NULL, version = version + 1, updated_at = ? WHERE id = ?').run(state, at, id);
        this.#activity(id, input.outcome === 'unavailable' ? 'lifecycle_unavailable' : 'lifecycle_completed', at, { action: operation.action, operationId: operation.id, outcome: input.outcome, evidence });
      }
      return this.get(owner, id);
    });
    if (result instanceof StoreError) throw result;
    return result;
  }

  appendMessage(owner: Owner, id: string, input: MessageInput): Delegation {
    this.#nonempty(input.text, 'text');
    const key = this.#nonempty(input.idempotencyKey, 'idempotencyKey');
    this.#validateVersion(input.expectedVersion);
    const requestHash = this.#hash(['message', id, input.expectedVersion, input.text]);
    return this.withTransaction(() => {
      const replay = this.#replay(owner, key, requestHash);
      if (replay) return this.get(owner, replay);
      const row = this.#owned(owner, id);
      this.#matchingVersion(row, input.expectedVersion);
      if (row.lifecycle === 'ended') throw new StoreError('conflict', '委托已结束，请新建关联委托继续。', 409);
      const messageId = randomUUID();
      const at = this.#clock();
      this.#db.prepare('INSERT INTO operator_messages VALUES (?, ?, ?, ?)').run(messageId, id, input.text, at);
      this.#db.prepare('UPDATE delegations SET version = version + 1, updated_at = ? WHERE id = ?').run(at, id);
      this.#activity(id, 'message_recorded', at, { messageId });
      this.#remember(owner, key, requestHash, id);
      return this.get(owner, id);
    });
  }

  #owned(owner: Owner, id: string): DelegationRow {
    this.#validateOwner(owner);
    this.#nonempty(id, 'delegationId');
    const row = this.#db.prepare('SELECT * FROM delegations WHERE id = ? AND enterprise_id = ? AND principal_id = ?').get(id, owner.enterpriseId, owner.principalId) as unknown as DelegationRow | undefined;
    if (!row) throw new StoreError('not_found', '未找到当前身份可访问的委托。', 404);
    return row;
  }

  #view(row: DelegationRow): Delegation {
    const revisionRows = this.#db.prepare('SELECT * FROM delegation_revisions WHERE delegation_id = ? ORDER BY revision').all(row.id) as unknown as { revision: number; goal: string; boundary: string; original_goal: string; original_boundary: string; created_at: string }[];
    const activityRows = this.#db.prepare('SELECT * FROM activity WHERE delegation_id = ? ORDER BY seq').all(row.id) as unknown as { seq: number; kind: string; created_at: string; detail: string }[];
    const revisions: GoalRevision[] = revisionRows.map((revision) => ({ revision: revision.revision, goal: revision.goal, boundary: revision.boundary, originalInput: { goal: revision.original_goal, boundary: revision.original_boundary }, createdAt: revision.created_at }));
    const activity: Activity[] = activityRows.map((entry) => ({ seq: entry.seq, kind: entry.kind, createdAt: entry.created_at, detail: JSON.parse(entry.detail) as Record<string, unknown> }));
    const messageRows = this.#db.prepare('SELECT * FROM operator_messages WHERE delegation_id = ? ORDER BY rowid').all(row.id) as unknown as { id: string; text: string; created_at: string }[];
    const messages: OperatorMessage[] = messageRows.map((entry) => ({ id: entry.id, role: 'operator', text: entry.text, createdAt: entry.created_at }));
    return { id: row.id, goal: row.goal, boundary: row.boundary, relatedTo: row.related_to, version: row.version, goalRevision: row.goal_revision, lifecycle: row.lifecycle, pendingOperation: row.pending_operation ? JSON.parse(row.pending_operation) as PendingOperation : null, createdAt: row.created_at, updatedAt: row.updated_at, research: { status: 'not_started', reason: 'runtime_unavailable' }, revisions, activity, messages };
  }

  #activity(id: string, kind: string, at: string, detail: Record<string, unknown>): void {
    this.#db.prepare('INSERT INTO activity (delegation_id, kind, created_at, detail) VALUES (?, ?, ?, ?)').run(id, kind, at, JSON.stringify(detail));
  }

  #hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

  #replay(owner: Owner, key: string, requestHash: string): string | null {
    this.#validateOwner(owner);
    const receipt = this.#db.prepare('SELECT request_hash, delegation_id FROM command_receipts WHERE enterprise_id = ? AND principal_id = ? AND key = ?').get(owner.enterpriseId, owner.principalId, key) as { request_hash: string; delegation_id: string } | undefined;
    if (!receipt) return null;
    if (receipt.request_hash !== requestHash) throw new StoreError('idempotency_conflict', '同一请求标识不能用于不同内容。', 409);
    return receipt.delegation_id;
  }

  #remember(owner: Owner, key: string, requestHash: string, id: string): void {
    this.#db.prepare('INSERT INTO command_receipts VALUES (?, ?, ?, ?, ?)').run(owner.enterpriseId, owner.principalId, key, requestHash, id);
  }

  #validateOwner(owner: Owner): void {
    this.#nonempty(owner.enterpriseId, 'enterpriseId');
    this.#nonempty(owner.principalId, 'principalId');
  }

  #nonempty(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new StoreError('invalid_input', `${name}不能为空。`);
    return value.trim();
  }

  #optionalText(value: unknown, name: string): string {
    if (value === undefined) return '';
    if (typeof value !== 'string') throw new StoreError('invalid_input', `${name}须为文字。`);
    return value.trim();
  }

  #validateVersion(version: unknown): void {
    if (!Number.isSafeInteger(version) || Number(version) < 1) throw new StoreError('invalid_input', 'expectedVersion须为正整数。');
  }

  #matchingVersion(row: DelegationRow, version: number): void {
    if (row.version !== version) throw new StoreError('conflict', '委托已有更新，请读取当前版本。', 409);
  }

  #saveLifecycleReceipt(id: string, requestHash: string, input: LifecycleReceipt, at: string, accepted: boolean, reason: string | null): void {
    this.#db.prepare('INSERT INTO lifecycle_receipts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, requestHash, input.operationId, input.expectedVersion, input.outcome, input.evidence, accepted ? 1 : 0, reason, at);
  }
}
