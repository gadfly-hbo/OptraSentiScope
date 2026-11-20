import type { Owner, Delegation, PendingOperation } from './domain.ts';
import { StoreError } from './domain.ts';
import type { SentiStore } from './store.ts';

export interface ControlResult {
  outcome: 'stopped' | 'eligible' | 'unavailable' | 'unknown';
  evidence: string;
}

/** Host-only side-effect seam. Never expose native handles or this port to the browser. */
export interface LifecycleControlPort {
  readonly status: { readonly status: string; readonly message: string };
  settle(input: {
    owner: Owner;
    delegation: Delegation;
    operation: PendingOperation;
    isCurrent: () => boolean;
  }): Promise<ControlResult>;
}

/** This local entrypoint has no Agent/Session/compute launcher. It cannot certify a deployed Harness. */
export const inactiveControlPort: LifecycleControlPort = {
  status: { status: 'unconfigured', message: '研究运行环境尚未接通，委托及记录已持久保存。' },
  async settle({ operation }) {
    return operation.action === 'resume'
      ? { outcome: 'unavailable', evidence: '此本地入口尚未注册任何研究运行能力，恢复资格未具备；没有派发研究。' }
      : { outcome: 'stopped', evidence: '此本地入口没有 Agent、Session 或计算启动实现，未派发研究资源。' };
  },
};

/** Durable delivery facts for business control intents, not a parallel Session lifecycle. */
export class ControlDelivery {
  readonly #store: SentiStore;
  readonly #owner: Owner;
  readonly #port: LifecycleControlPort;
  #closed = false;

  constructor(store: SentiStore, owner: Owner, port: LifecycleControlPort) {
    this.#store = store; this.#owner = Object.freeze({ ...owner }); this.#port = port;
    store.connection.exec(`CREATE TABLE IF NOT EXISTS control_deliveries (
      operation_id TEXT PRIMARY KEY, enterprise_id TEXT NOT NULL, principal_id TEXT NOT NULL,
      delegation_id TEXT NOT NULL REFERENCES delegations(id), requested_version INTEGER NOT NULL,
      action TEXT NOT NULL, state TEXT NOT NULL, evidence TEXT
    )`);
    // A prior process may already have called a side-effecting port. Never call it again blindly.
    const rows = store.connection.prepare("SELECT operation_id, delegation_id, requested_version FROM control_deliveries WHERE enterprise_id=? AND principal_id=? AND state='dispatched'").all(owner.enterpriseId, owner.principalId) as unknown as { operation_id: string; delegation_id: string; requested_version: number }[];
    for (const row of rows) this.#finish(row.delegation_id, row.operation_id, row.requested_version, { outcome: 'unknown', evidence: 'Host 上次派发后的回执未确认；重开保留 UNKNOWN，未重放。' });
  }

  /** Called within the same synchronous transaction as the business command. */
  record(delegation: Delegation, expectedVersion: number, action: string): boolean {
    const operation = delegation.pendingOperation;
    if (!operation || operation.action !== action || operation.requestedVersion !== expectedVersion + 1) return false;
    const result = this.#store.connection.prepare('INSERT OR IGNORE INTO control_deliveries VALUES (?, ?, ?, ?, ?, ?, ?, NULL)').run(operation.id, this.#owner.enterpriseId, this.#owner.principalId, delegation.id, operation.requestedVersion, operation.action, 'recorded');
    return result.changes === 1;
  }

  async recoverRecorded(): Promise<void> {
    const rows = this.#store.connection.prepare("SELECT operation_id, delegation_id FROM control_deliveries WHERE enterprise_id=? AND principal_id=? AND state='recorded'").all(this.#owner.enterpriseId, this.#owner.principalId) as unknown as { operation_id: string; delegation_id: string }[];
    for (const row of rows) {
      if (this.#closed) return;
      const current = this.#store.get(this.#owner, row.delegation_id);
      if (current.pendingOperation?.id === row.operation_id) await this.dispatch(current.id, current.pendingOperation);
      else this.#store.connection.prepare("UPDATE control_deliveries SET state='superseded' WHERE operation_id=? AND state='recorded'").run(row.operation_id);
    }
  }

  /** Invoke the external resource port only after the command transaction commits. */
  async dispatch(id: string, operation: PendingOperation): Promise<void> {
    if (this.#closed) return;
    const eligible = this.#store.withTransaction(() => {
      if (!this.#isCurrent(id, operation.id)) return false;
      return this.#store.connection.prepare("UPDATE control_deliveries SET state='dispatched' WHERE operation_id=? AND state='recorded'").run(operation.id).changes === 1;
    });
    if (!eligible) return;
    let result: ControlResult;
    try {
      result = await this.#port.settle({ owner: this.#owner, delegation: this.#store.get(this.#owner, id), operation, isCurrent: () => !this.#closed && this.#isCurrent(id, operation.id) });
    } catch {
      result = { outcome: 'unknown', evidence: '运行控制端口未返回可核实回执；保留 UNKNOWN，未重放。' };
    }
    if (!this.#closed) this.#finish(id, operation.id, operation.requestedVersion, result);
  }

  close(): void {
    this.#closed = true;
    const rows = this.#store.connection.prepare("SELECT operation_id, delegation_id, requested_version FROM control_deliveries WHERE enterprise_id=? AND principal_id=? AND state='dispatched'").all(this.#owner.enterpriseId, this.#owner.principalId) as unknown as { operation_id: string; delegation_id: string; requested_version: number }[];
    for (const row of rows) this.#finish(row.delegation_id, row.operation_id, row.requested_version, { outcome: 'unknown', evidence: 'Host 正在关闭，派发后的停止或恢复事实尚未确认；保留 UNKNOWN。' });
  }

  #isCurrent(id: string, operationId: string): boolean {
    return this.#store.get(this.#owner, id).pendingOperation?.id === operationId;
  }

  #finish(id: string, operationId: string, version: number, result: ControlResult) {
    this.#store.withTransaction(() => {
      try {
        this.#store.completeLifecycle(this.#owner, id, { operationId, expectedVersion: version, ...result });
        this.#store.connection.prepare('UPDATE control_deliveries SET state=?, evidence=? WHERE operation_id=?').run(result.outcome === 'unknown' ? 'unknown' : 'settled', result.evidence, operationId);
      } catch (error) {
        if (!(error instanceof StoreError) || error.code !== 'invalid_receipt') throw error;
        this.#store.connection.prepare("UPDATE control_deliveries SET state='superseded', evidence=? WHERE operation_id=?").run(result.evidence, operationId);
      }
    });
  }
}
