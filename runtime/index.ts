import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { ScheduleTiming, ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule';

/** Host-owned qualification; every asynchronous callback retains this exact generation. */
export interface RunBinding {
  readonly owner: { readonly enterpriseId: string; readonly principalId: string };
  readonly delegationId: string;
  readonly goalRevision: number;
  readonly role: 'main' | 'worker';
  readonly assignmentId?: string;
  readonly epoch: number;
  readonly generation: number;
}

export type AdmissionPhase = 'open' | 'deliver' | 'step' | 'tool' | 'schedule';
export interface NativeFact {
  readonly binding: RunBinding;
  readonly sessionId: string;
}
export interface NativeReadFact extends NativeFact {
  readonly messageId: string;
  readonly turn: number;
}
export interface NativeTurnFact extends NativeFact {
  /** Persisted native facts, never a business judgment or acceptance verdict. */
  readonly end: SessionEvent<'turn/end'>;
  readonly events: readonly SessionEvent[];
}
export interface NativeFailureFact extends NativeFact {
  readonly error: unknown;
  readonly turn?: number;
  readonly step?: number;
}

export interface NativeStepFact {
  readonly turn: number;
  readonly step: number;
  /** Only native Schedule inputs; tool continuation steps are never classified as a heartbeat. */
  readonly scheduledOnly: boolean;
}

export interface NativeOpenOptions {
  readonly sessionId?: string;
  readonly resume?: boolean;
  /** No default provider. Synthetic adapters belong only to engineering fixtures. */
  readonly model?: { readonly provider: string; readonly model: string; readonly maxTokens?: number };
  readonly tools: readonly ToolDefinition[];
  /** Restored from Host business mappings, never discovered from Host-wide Schedule catalog. */
  readonly scheduleIds?: readonly string[];
  admit(binding: RunBinding, phase: AdmissionPhase, toolName?: string): boolean;
  /** Host qualification refresh before a model step; must not launch/await this same Agent. */
  beforeStep?(binding: RunBinding, fact?: NativeStepFact): Promise<void | boolean>;
  onRead?(fact: NativeReadFact): void | Promise<void>;
  onTurn?(fact: NativeTurnFact): void | Promise<void>;
  onFailure?(fact: NativeFailureFact): void | Promise<void>;
}

export interface NativeResearchHandle {
  readonly binding: RunBinding;
  readonly sessionId: string;
  readonly configured: boolean;
  /** Receipt proves durable native inbox admission; it does not prove reading or completion. */
  deliver(message: { readonly id: string; readonly text: string; readonly sourceRefs?: readonly string[] }): Promise<{ readonly messageId: string; readonly accepted: true }>;
  /** Resource causes are native hook cancellations; omission means operator cancellation. */
  cancel(reason?: string): void;
  /** Abort the active turn without closing future scheduled admission for a research-only pause. */
  interrupt?(reason?: string): void;
  whenIdle(): Promise<void>;
  /** Closes admission, cancels, awaits quiescence, flushes facts, then disposes the owned native handle. */
  dispose(): Promise<void>;
  createSchedule(request: { readonly title: string; readonly prompt: string; readonly timing: ScheduleTiming }): Promise<ScheduleCatalogEntry>;
  disableSchedule(id: string): Promise<void>;
  listSchedules(): Promise<readonly ScheduleCatalogEntry[]>;
  /** Re-drive only known active native tasks after current main Session restoration; never creates or runs a task. */
  refreshSchedules?(): Promise<void>;
}

export interface NativeResearchPort {
  open(binding: RunBinding, options: NativeOpenOptions): Promise<NativeResearchHandle>;
  dispose(): Promise<void>;
}

export interface NativePortOptions {
  /** Host resource/egress guard around each official stream dispatch, including native retries. */
  modelStream?(fact: NativeFact, request: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>;
  /** Only the Host may restore one already mapped Session with its current business qualification. */
  restore?(sessionId: string): Promise<{ readonly binding: RunBinding; readonly options: NativeOpenOptions } | undefined>;
  /** Authorized environment scan before a native scheduled delivery; does not choose research work. */
  beforeWake?(fact: NativeFact): Promise<void>;
}
