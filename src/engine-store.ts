import type { Assessor, Executor, Outbox, Repositories, Trigger, TriggerDisposition, Thread, Ticket, Decision, OutboundMessage, ReplyStatus } from 'dsh-superagent';
import { createHash } from 'node:crypto';
import { StoreError } from './domain.ts';
import type { Owner } from './domain.ts';
import type { SentiStore } from './store.ts';

export type EngineIntentKind = 'assess' | 'release-assessment' | 'start' | 'deliver' | 'stop' | 'outbound';
export type EngineIntentState = 'pending' | 'claimed' | 'sent' | 'unknown' | 'dropped';
export interface EngineIntent {
  id: string;
  kind: EngineIntentKind;
  key: string;
  generation: number;
  state: EngineIntentState;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  nativeMessageId?: string;
  receipt?: Readonly<Record<string, unknown>>;
}
export interface EngineSettlement {
  state: 'sent' | 'unknown' | 'dropped';
  nativeMessageId?: string;
  receipt?: Readonly<Record<string, unknown>>;
}

/** Product persistence adapter for the official public Engine ports; no Runtime or ticket state machine. */
export class EngineStore {
  readonly repo: Repositories;
  readonly assessor: Assessor;
  readonly executor: Executor;
  readonly outbox: Outbox;
  readonly #store: SentiStore;
  readonly #namespace: string;
  readonly #delegationId: string;
  readonly #now: () => string;

  constructor(store: SentiStore, binding: { owner: Owner; delegationId: string; now?: () => string }) {
    store.get(binding.owner, binding.delegationId);
    this.#store = store;
    this.#delegationId = binding.delegationId;
    this.#now = binding.now ?? (() => new Date().toISOString());
    this.#namespace = JSON.stringify([binding.owner.enterpriseId, binding.owner.principalId, binding.delegationId]);
    store.connection.exec(`CREATE TABLE IF NOT EXISTS engine_records (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      namespace TEXT NOT NULL, delegation_id TEXT NOT NULL REFERENCES delegations(id),
      kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
      UNIQUE(namespace, kind, key)
    );
    CREATE TABLE IF NOT EXISTS engine_intents (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      namespace TEXT NOT NULL, delegation_id TEXT NOT NULL REFERENCES delegations(id),
      kind TEXT NOT NULL, key TEXT NOT NULL, generation INTEGER NOT NULL, state TEXT NOT NULL,
      payload TEXT NOT NULL CHECK(json_valid(payload)),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, native_message_id TEXT,
      receipt TEXT CHECK(receipt IS NULL OR json_valid(receipt)),
      UNIQUE(namespace, kind, key, generation)
    );
    CREATE TABLE IF NOT EXISTS engine_intent_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT NOT NULL,
      intent_id TEXT NOT NULL REFERENCES engine_intents(id), at TEXT NOT NULL,
      detail TEXT NOT NULL CHECK(json_valid(detail))
    );
    CREATE TABLE IF NOT EXISTS engine_outbox_receipts (
      namespace TEXT NOT NULL, delegation_id TEXT NOT NULL REFERENCES delegations(id),
      message_id TEXT NOT NULL, generation INTEGER NOT NULL,
      message TEXT NOT NULL CHECK(json_valid(message)), status TEXT NOT NULL,
      active INTEGER NOT NULL, withdrawn_at TEXT,
      PRIMARY KEY(namespace, message_id, generation)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS engine_outbox_active
      ON engine_outbox_receipts(namespace, message_id) WHERE active=1`);
    this.repo = {
      atomic: (work) => store.withTransaction(work),
      triggers: {
        get: (id) => this.#read<Trigger>('trigger', id), save: (value) => this.#save('trigger', value.id, value),
        disposition: (id) => this.#read<TriggerDisposition>('disposition', id),
        saveDisposition: (id, value) => this.#save('disposition', id, value),
      },
      threads: {
        get: (key) => this.#read<Thread>('thread', key), save: (value) => this.#save('thread', value.key, value),
        list: () => this.#list<Thread>('thread'),
        active: () => this.#list<Thread>('thread', false, "AND (json_array_length(value, '$.pending') > 0 OR value -> '$.evaluating' IS NOT NULL)"),
      },
      tickets: {
        get: (id) => this.#read<Ticket>('ticket', id), save: (value) => this.#save('ticket', value.id, value),
        list: () => this.#list<Ticket>('ticket', true),
        open: () => this.#list<Ticket>('ticket', true, "AND value -> '$.ended' IS NULL"),
        active: () => this.#list<Ticket>('ticket', true, "AND (json_array_length(value, '$.undelivered') > 0 OR value ->> '$.assignments[#-1].state' IN ('pending', 'running'))"),
      },
      decisions: {
        get: (id) => this.#read<Decision>('decision', id), save: (value) => this.#save('decision', value.id, value),
        byThread: (key) => this.#list<Decision>('decision', false, "AND value ->> '$.threadKey' = ?", key),
      },
    };
    this.assessor = {
      request: (candidate) => { this.#enqueue('assess', candidate.evalId, { candidate }); },
      release: (evalId) => { this.#enqueue('release-assessment', evalId, { evalId }); },
    };
    this.executor = {
      start: (ticket, assignment) => { this.#enqueue('start', assignment.id, { ticketId: ticket.id, assignmentId: assignment.id, inputIds: [...ticket.undelivered] }); },
      deliver: (ticket, assignment) => { this.#enqueue('deliver', JSON.stringify([assignment.id, ticket.undelivered]), { ticketId: ticket.id, assignmentId: assignment.id, inputIds: [...ticket.undelivered] }); },
      stop: (ticket, assignment, reason) => { this.#enqueue('stop', JSON.stringify([assignment.id, reason]), { ticketId: ticket.id, assignmentId: assignment.id, reason }); },
    };
    this.outbox = {
      send: (message) => this.#send(message),
      status: (id) => this.#outboundReceipt(id)?.status as ReplyStatus | undefined,
      withdraw: (id) => this.#withdraw(id),
    };
  }

  listPending(): EngineIntent[] {
    return this.#store.connection.prepare('SELECT * FROM engine_intents WHERE namespace=? AND state=? ORDER BY seq')
      .all(this.#namespace, 'pending').map(row => this.#intent(row));
  }

  /** Claimed and uncertain facts are read for reconciliation, never reset for replay. */
  listUnsettled(): EngineIntent[] {
    return this.#store.connection.prepare("SELECT * FROM engine_intents WHERE namespace=? AND state IN ('claimed', 'unknown') ORDER BY seq")
      .all(this.#namespace).map(row => this.#intent(row));
  }

  /** Claim records admission uncertainty; a restart must reconcile it rather than replay it. */
  claim(id: string): EngineIntent | undefined {
    return this.#store.withTransaction(() => {
      const intent = this.get(id);
      if (intent?.state !== 'pending') return undefined;
      if (intent.kind === 'outbound') {
        const message = intent.payload.message as OutboundMessage;
        const uncertain = this.#store.connection.prepare(`SELECT id FROM engine_intents WHERE namespace=? AND kind='outbound'
          AND state IN ('claimed', 'unknown') AND payload ->> '$.message.id'=? AND id<>? LIMIT 1`)
          .get(this.#namespace, message.id, id);
        if (uncertain) return undefined;
      }
      this.#transition(intent, { state: 'claimed' });
      return this.get(id);
    });
  }

  settle(id: string, result: EngineSettlement): EngineIntent | undefined {
    return this.#store.withTransaction(() => {
      const intent = this.get(id);
      if (!intent) return undefined;
      if (intent.state === result.state) return intent;
      if (intent.state !== 'claimed' && intent.state !== 'unknown' && !(intent.state === 'pending' && result.state === 'dropped')) {
        throw new StoreError('engine_receipt_state', '投递回执状态不允许此变更。', 409);
      }
      this.#transition(intent, result);
      if (intent.kind === 'outbound') this.#settleOutbound(intent, result.state);
      return this.get(id);
    });
  }

  get(id: string): EngineIntent | undefined {
    const row = this.#store.connection.prepare('SELECT * FROM engine_intents WHERE namespace=? AND id=?').get(this.#namespace, id);
    return row ? this.#intent(row) : undefined;
  }

  #enqueue(kind: EngineIntentKind, key: string, payload: Record<string, unknown>): EngineIntent {
    return this.#store.withTransaction(() => {
      const prior = this.#intentByKey(kind, key);
      if (prior && prior.state !== 'dropped') return prior;
      const generation = (prior?.generation ?? 0) + 1;
      const id = createHash('sha256').update(JSON.stringify([this.#namespace, kind, key, generation])).digest('hex');
      const at = this.#now();
      this.#store.connection.prepare(`INSERT INTO engine_intents
        (id, namespace, delegation_id, kind, key, generation, state, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
        .run(id, this.#namespace, this.#delegationId, kind, key, generation, JSON.stringify(payload), at, at);
      return this.get(id)!;
    });
  }

  #outboundReceipt(messageId: string): Record<string, unknown> | undefined {
    return this.#store.connection.prepare('SELECT * FROM engine_outbox_receipts WHERE namespace=? AND message_id=? AND active=1')
      .get(this.#namespace, messageId);
  }

  #send(message: OutboundMessage): void {
    this.#store.withTransaction(() => {
      if (this.#outboundReceipt(message.id)) return;
      const row = this.#store.connection.prepare('SELECT MAX(generation) AS latest FROM engine_outbox_receipts WHERE namespace=? AND message_id=?')
        .get(this.#namespace, message.id);
      const generation = Number(row?.latest ?? 0) + 1;
      this.#store.connection.prepare(`INSERT INTO engine_outbox_receipts
        (namespace, delegation_id, message_id, generation, message, status, active) VALUES (?, ?, ?, ?, ?, 'pending', 1)`)
        .run(this.#namespace, this.#delegationId, message.id, generation, JSON.stringify(message));
      this.#enqueue('outbound', JSON.stringify([message.id, generation]), { message, generation });
    });
  }

  #withdraw(messageId: string): void {
    this.#store.withTransaction(() => {
      const receipt = this.#outboundReceipt(messageId);
      if (receipt?.status !== 'pending') return;
      this.#store.connection.prepare('UPDATE engine_outbox_receipts SET active=0, withdrawn_at=? WHERE namespace=? AND message_id=? AND generation=?')
        .run(this.#now(), this.#namespace, messageId, Number(receipt.generation));
      const intent = this.#intentByKey('outbound', JSON.stringify([messageId, Number(receipt.generation)]))!;
      if (intent.state === 'pending') this.#transition(intent, { state: 'dropped', receipt: { reason: 'withdrawn-before-claim' } });
      this.#store.connection.prepare('INSERT INTO engine_intent_events (namespace, intent_id, at, detail) VALUES (?, ?, ?, ?)')
        .run(this.#namespace, intent.id, this.#now(), JSON.stringify({ action: 'withdraw', dispatchState: intent.state }));
    });
  }

  #settleOutbound(intent: EngineIntent, state: EngineSettlement['state']): void {
    if (state === 'unknown') return;
    const message = intent.payload.message as OutboundMessage;
    const generation = Number(intent.payload.generation);
    if (state === 'sent') {
      // A late native receipt wins over a later enqueue that was held for reconciliation.
      const current = this.#outboundReceipt(message.id);
      if (current && Number(current.generation) !== generation) {
        const newer = this.#intentByKey('outbound', JSON.stringify([message.id, Number(current.generation)]));
        if (newer?.state === 'pending') this.#transition(newer, { state: 'dropped', receipt: { reason: 'prior-generation-sent', priorIntentId: intent.id } });
      }
      this.#store.connection.prepare('UPDATE engine_outbox_receipts SET active=0 WHERE namespace=? AND message_id=?')
        .run(this.#namespace, message.id);
      this.#store.connection.prepare("UPDATE engine_outbox_receipts SET status='sent', active=1 WHERE namespace=? AND message_id=? AND generation=?")
        .run(this.#namespace, message.id, generation);
    } else {
      this.#store.connection.prepare("UPDATE engine_outbox_receipts SET status='dropped' WHERE namespace=? AND message_id=? AND generation=?")
        .run(this.#namespace, message.id, generation);
    }
  }

  #intentByKey(kind: EngineIntentKind, key: string): EngineIntent | undefined {
    const row = this.#store.connection.prepare('SELECT * FROM engine_intents WHERE namespace=? AND kind=? AND key=? ORDER BY generation DESC LIMIT 1').get(this.#namespace, kind, key);
    return row ? this.#intent(row) : undefined;
  }

  #transition(intent: EngineIntent, result: { state: EngineIntentState; nativeMessageId?: string; receipt?: Readonly<Record<string, unknown>> }): void {
    const at = this.#now();
    this.#store.connection.prepare(`UPDATE engine_intents SET state=?, updated_at=?, native_message_id=?, receipt=? WHERE namespace=? AND id=?`)
      .run(result.state, at, result.nativeMessageId ?? intent.nativeMessageId ?? null,
        result.receipt ? JSON.stringify(result.receipt) : intent.receipt ? JSON.stringify(intent.receipt) : null, this.#namespace, intent.id);
    this.#store.connection.prepare('INSERT INTO engine_intent_events (namespace, intent_id, at, detail) VALUES (?, ?, ?, ?)')
      .run(this.#namespace, intent.id, at, JSON.stringify({ from: intent.state, ...result }));
  }

  #intent(row: Record<string, unknown>): EngineIntent {
    return {
      id: String(row.id), kind: row.kind as EngineIntentKind, key: String(row.key), generation: Number(row.generation), state: row.state as EngineIntentState,
      payload: JSON.parse(String(row.payload)) as Record<string, unknown>, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      ...(row.native_message_id === null ? {} : { nativeMessageId: String(row.native_message_id) }),
      ...(row.receipt === null ? {} : { receipt: JSON.parse(String(row.receipt)) as Record<string, unknown> }),
    };
  }

  #read<T>(kind: string, key: string): T | undefined {
    const row = this.#store.connection.prepare('SELECT value FROM engine_records WHERE namespace=? AND kind=? AND key=?').get(this.#namespace, kind, key);
    return row ? JSON.parse(String(row.value)) as T : undefined;
  }

  #save(kind: string, key: string, value: unknown): void {
    this.#store.connection.prepare(`INSERT INTO engine_records (namespace, delegation_id, kind, key, value) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(namespace, kind, key) DO UPDATE SET value=excluded.value`).run(this.#namespace, this.#delegationId, kind, key, JSON.stringify(value));
  }

  #list<T>(kind: string, descending = false, filter = '', ...parameters: string[]): T[] {
    return this.#store.connection.prepare(`SELECT value FROM engine_records WHERE namespace=? AND kind=? ${filter} ORDER BY seq ${descending ? 'DESC' : 'ASC'}`)
      .all(this.#namespace, kind, ...parameters).map(row => JSON.parse(String(row.value)) as T);
  }
}
