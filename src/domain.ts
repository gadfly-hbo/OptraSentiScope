/** Business contracts only. Harness and official Engine remain runtime/ticket authorities. */
export interface Owner {
  readonly enterpriseId: string;
  readonly principalId: string;
}

export type Lifecycle = 'active' | 'pausing' | 'paused' | 'resuming' | 'ending' | 'ended';
export type LifecycleAction = 'pause' | 'resume' | 'end';

export interface PendingOperation {
  readonly id: string;
  readonly action: LifecycleAction;
  readonly requestedVersion: number;
  readonly requestedAt: string;
  readonly outcome: 'pending' | 'unknown';
}

export interface GoalRevision {
  readonly revision: number;
  readonly goal: string;
  readonly boundary: string;
  readonly originalInput: { readonly goal: string; readonly boundary: string };
  readonly createdAt: string;
}

export interface Activity {
  readonly seq: number;
  readonly kind: string;
  readonly createdAt: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

export interface OperatorMessage {
  readonly id: string;
  readonly role: 'operator';
  readonly text: string;
  readonly createdAt: string;
}

export interface Delegation {
  readonly id: string;
  readonly goal: string;
  readonly boundary: string;
  readonly relatedTo: string | null;
  /** Optimistic concurrency token for all business writes. */
  readonly version: number;
  /** Human-visible goal revision; lifecycle changes do not rewrite the goal. */
  readonly goalRevision: number;
  readonly lifecycle: Lifecycle;
  readonly pendingOperation: PendingOperation | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly research: { readonly status: 'not_started'; readonly reason: 'runtime_unavailable' };
  readonly revisions: readonly GoalRevision[];
  readonly activity: readonly Activity[];
  readonly messages: readonly OperatorMessage[];
}

export interface CreateDelegation {
  readonly goal: string;
  readonly boundary?: string;
  readonly relatedTo?: string;
  readonly idempotencyKey: string;
}

export interface AdjustDelegation {
  readonly expectedVersion: number;
  readonly goal: string;
  readonly boundary?: string;
  readonly idempotencyKey: string;
}

export interface LifecycleRequest {
  readonly expectedVersion: number;
  readonly action: LifecycleAction;
  readonly idempotencyKey: string;
}

export interface LifecycleReceipt {
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly outcome: 'stopped' | 'eligible' | 'unavailable' | 'unknown';
  readonly evidence: string;
}

export interface MessageInput {
  readonly expectedVersion: number;
  readonly text: string;
  readonly idempotencyKey: string;
}

export class StoreError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.status = status;
  }
}
