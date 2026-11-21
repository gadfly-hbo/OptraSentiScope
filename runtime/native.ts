import type { Context } from '@deepseek-ai/cordis';
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
import type { AgentCancelCause } from '@deepseek-ai/dsh-agent';
import { freezeMessage, MessageId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { ScheduleId } from '@deepseek-ai/dsh-schedule';
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule';
import type {} from '@deepseek-ai/dsh-session-persistence';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { NativeResearchPort, NativePortOptions, NativeResearchHandle, NativeOpenOptions, RunBinding, AdmissionPhase } from './index.ts';

export * from './index.ts';

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    sentiscope: { readonly kind: 'sentiscope'; readonly delegationId: string; readonly sourceRefs: readonly string[] };
  }
}

const scheduleFactFields = new Set(['status', 'updatedAt', 'lastDelivery', 'executionActive', 'deliveryFloorEndsAt', 'scheduledAt']);
function scheduleDescription(row: ScheduleCatalogEntry) { return Object.fromEntries(Object.entries(row).filter(([field]) => !scheduleFactFields.has(field))); }
function committedScheduleProgress(before: ScheduleCatalogEntry, after: ScheduleCatalogEntry, sessionId: string): boolean {
  if (after.id !== before.id || after.target.kind !== 'session' || after.target.sessionId !== sessionId || !['active', 'ended'].includes(after.status) || !isDeepStrictEqual(scheduleDescription(before), scheduleDescription(after))) return false;
  const previousAt = Date.parse(before.scheduledAt), currentAt = Date.parse(after.scheduledAt);
  if (!Number.isFinite(previousAt) || !Number.isFinite(currentAt) || currentAt < previousAt || ['at', 'after'].includes(before.kind) && currentAt !== previousAt) return false;
  const receipt = after.lastDelivery;
  if (!receipt || typeof receipt.messageId !== 'string' || !receipt.messageId.trim() || receipt.messageId === before.lastDelivery?.messageId || receipt.targetSessionId !== sessionId) return false;
  const occurrence = Date.parse(receipt.scheduledAt);
  return Number.isFinite(occurrence) && Number.isFinite(Date.parse(receipt.deliveredAt)) && occurrence >= previousAt && occurrence <= currentAt;
}

/** Owned composition over the official Agent, Session, tool executor and Schedule services. */
export function createNativeResearchPort(ctx: Context, portOptions: NativePortOptions = {}): NativeResearchPort {
  const handles = new Map<string, { native: AgentHandle; public: NativeResearchHandle; options: NativeOpenOptions; canSchedule(): boolean; releaseReads(): Promise<void> }>();
  const opening = new Map<string, Promise<NativeResearchHandle>>();
  let stopping = false;

  const resolveSchedule = ctx.on('schedule/resolve-agent', async (id) => {
    let entry = handles.get(id);
    if (!entry) {
      const restored = await portOptions.restore?.(id);
      if (!restored || restored.options.sessionId !== id || restored.options.resume !== true) throw new Error('NATIVE_SCHEDULE_UNOWNED');
      await open(restored.binding, restored.options);
      entry = handles.get(id);
    }
    if (!entry || !entry.public.configured || !entry.canSchedule()) throw new Error('NATIVE_ADMISSION_DENIED');
    await portOptions.beforeWake?.({ binding: entry.public.binding, sessionId: id });
    if (!entry.canSchedule()) throw new Error('NATIVE_ADMISSION_DENIED');
    return entry.native.agent;
  });

  const stopModelGuard = portOptions.modelStream ? ctx.on('llm/stream', (request, next) => {
    const entry=request.sessionId?handles.get(request.sessionId):undefined;
    if(stopping||!entry||!entry.options.admit(entry.public.binding,'step'))throw new Error('NATIVE_MODEL_UNOWNED');
    return portOptions.modelStream!({binding:entry.public.binding,sessionId:entry.public.sessionId},request,async function*(){await entry.releaseReads();if(stopping||!entry.options.admit(entry.public.binding,'step'))throw new Error('NATIVE_ADMISSION_DENIED');yield*next();});
  }) : ()=>{};

  async function open(input: RunBinding, options: NativeOpenOptions): Promise<NativeResearchHandle> {
    if (stopping || !options.admit(input, 'open')) throw new Error('NATIVE_ADMISSION_DENIED');
    // The Host's qualification is detached before asynchronous native setup.
    const binding: RunBinding = Object.freeze({ ...input, owner: Object.freeze({ ...input.owner }) });
    const id = options.sessionId ?? `sentiscope-${randomUUID()}`;
    if (handles.has(id)) throw new Error('NATIVE_SESSION_ALREADY_OWNED');
    if (opening.has(id)) throw new Error('NATIVE_SESSION_ALREADY_OWNED');
    const promise = create(id, binding, options);
    opening.set(id, promise);
    try { return await promise; }
    finally { opening.delete(id); }
  }

  async function create(id: string, binding: RunBinding, options: NativeOpenOptions): Promise<NativeResearchHandle> {
    let closed = false;
    let cancelCause:AgentCancelCause={kind:'user'};
    let native: AgentHandle;
    let observerError: unknown;
    let disposal: Promise<void> | undefined;
    let pending: Promise<void> = Promise.resolve();
    let cursor = 0;
    const knownSchedules = new Set(options.scheduleIds ?? []);
    const delivered = new Set<string>();
    const waitingReads: Array<()=>Promise<void>>=[];
    async function releaseReads(){for(const work of waitingReads.splice(0))observe(work);await pending;if(observerError)throw observerError;}
    const sessionId = SessionId(id);
    const fact = { binding, sessionId: id };
    function admitted(phase: AdmissionPhase, toolName?: string): boolean {
      return !closed && !stopping && options.admit(binding, phase, toolName);
    }
    function requireAdmission(phase: AdmissionPhase, toolName?: string): void {
      if (!admitted(phase, toolName)) throw new Error('NATIVE_ADMISSION_DENIED');
    }
    function observe(work: () => Promise<void>) {
      // Serialize incremental fact delivery; no stream rewriting, model loop, or hidden retry.
      pending = pending.then(work).catch((error: unknown) => { observerError ??= error; });
    }
    async function read(from: number, length?: number): Promise<readonly SessionEvent[]> {
      if (!await ctx.sessions.flush(native.agent.session)) throw new Error('NATIVE_PERSISTENCE_UNAVAILABLE');
      const reader = await ctx.sessionPersistence.open(sessionId, 'read');
      try { return (await reader.read(from, length)).events; }
      finally { await reader.close(); }
    }
    const setup = (agentCtx: Context) => {
      // Restrictions intersect; no global base, shell, files or export tool becomes available.
      agentCtx.tools.restrict({ allow: [] });
      const toolNames = new Set<string>();
      for (const definition of options.tools) {
        if (toolNames.has(definition.name)) throw new Error('NATIVE_DUPLICATE_TOOL');
        toolNames.add(definition.name);
        agentCtx.tools.register({
          ...definition,
          async execute(args, exec) {
            requireAdmission('tool', definition.name);
            exec.signal.throwIfAborted();
            return definition.execute(args, exec);
          },
        });
      }
      agentCtx.on('agent/pre-step', async (payload, next) => {
        if (!admitted('step')) return { kind: 'reject' };
        const proceed=await options.beforeStep?.(binding,{turn:payload.turn,step:payload.step,scheduledOnly:payload.messages.length>0&&payload.messages.every(message=>['schedule'].includes(message.source.kind))});
        if(proceed===false)return {kind:'reject'};
        return admitted('step') ? next() : { kind: 'reject' };
      });
      let stepTurn = 0;
      agentCtx.on('session/event', (_session, event) => {
        if (event.type === 'step/start') stepTurn = event.data.turn;
        if (event.type === 'user/message' && ['sentiscope', 'schedule'].includes(event.data.source.kind)) {
          const messageId = event.data.id;
          const turn = stepTurn;
          const publish=async () => {
            const persisted = await read(event.seq, 1);
            if (!persisted.some(value => value.seq === event.seq && value.type === 'user/message')) throw new Error('NATIVE_READ_NOT_DURABLE');
            await options.onRead?.({ ...fact, messageId, turn });
          };
          if(portOptions.modelStream)waitingReads.push(publish);else observe(publish);
        }
        if (event.type !== 'turn/end') return;
        const endSeq = event.seq;
        observe(async () => {
          const events = await read(cursor, endSeq - cursor + 1);
          const end = events.find((value) => value.seq === endSeq && value.type === 'turn/end');
          if (!end || end.type !== 'turn/end') throw new Error('NATIVE_TURN_NOT_DURABLE');
          cursor = endSeq + 1;
          await options.onTurn?.({ ...fact, end: end as SessionEvent<'turn/end'>, events });
        });
      });
      agentCtx.on('agent/error', (payload) => {
        observe(async () => { await options.onFailure?.({ ...fact, error: payload.error, turn: payload.turn, step: payload.step }); });
      });
      return { commit() { if (closed || stopping || !options.admit(binding, 'open')) throw new Error('NATIVE_ADMISSION_DENIED'); } };
    };
    native = options.resume
      ? await ctx.agents.resume({ resumeSessionId: sessionId, agentOptions: options.model, setup })
      : await ctx.agents.create({ sessionId, agentOptions: options.model, setup });
    try {
      // Qualification may have changed while the factory awaited persistence/setup.
      requireAdmission('open');
      cursor = native.agent.session.firstLiveSeq;
      const publicHandle: NativeResearchHandle = {
        binding, sessionId: id, configured: Boolean(options.model?.provider && options.model.model),
        async deliver(message) {
          requireAdmission('deliver');
          if (!options.model?.provider || !options.model.model) throw new Error('NATIVE_UNCONFIGURED');
          if (!message.id || delivered.has(message.id)) throw new Error('NATIVE_DELIVERY_ALREADY_ATTEMPTED');
          delivered.add(message.id); // Unknown outcomes must be resolved by the Host, never blindly replayed.
          const text = message.sourceRefs?.length ? `${message.text}\n\nSource references:\n${message.sourceRefs.join('\n')}` : message.text;
          native.agent.followup(freezeMessage({ id: MessageId(message.id), role: 'user', content: [{ type: 'text', text }], source: { kind: 'sentiscope', delegationId: binding.delegationId, sourceRefs: [...message.sourceRefs ?? []] } }));
          if (!await ctx.sessions.flush(native.agent.session)) throw new Error('NATIVE_PERSISTENCE_UNAVAILABLE');
          return { messageId: message.id, accepted: true };
        },
        cancel(reason) { if(!closed){cancelCause=reason?{kind:'hook',reason}:{kind:'user'};closed = true; native.agent.cancel(cancelCause, { keepInbox: true });} },
        interrupt(reason) { if(!closed)native.agent.cancel(reason?{kind:'hook',reason}:{kind:'user'}, { keepInbox: true }); },
        async whenIdle() { await native.agent.whenIdle(); await pending; if (observerError) throw observerError; },
        dispose() {
          disposal ??= (async () => {
            closed = true;
            native.agent.cancel(cancelCause, { keepInbox: true });
            try { await native.agent.whenIdle(); await pending; await ctx.sessions.flush(native.agent.session); }
            finally { await native.dispose(); handles.delete(id); }
            if (observerError) throw observerError;
          })();
          return disposal;
        },
        async createSchedule(request) {
          requireAdmission('schedule');
          if (binding.role !== 'main') throw new Error('NATIVE_WORKER_SCHEDULE_DENIED');
          if (!options.model?.provider || !options.model.model) throw new Error('NATIVE_UNCONFIGURED');
          const row = await ctx.schedule.create({ ...request, target: { kind: 'session', sessionId } }, sessionId);
          knownSchedules.add(row.id);
          return row;
        },
        async disableSchedule(scheduleId) {
          // Closing may still disable its known timers; disabling never activates a Session.
          if (!knownSchedules.has(scheduleId)) throw new Error('NATIVE_SCHEDULE_UNOWNED');
          const row = await ctx.schedule.view({ id: ScheduleId(scheduleId) });
          if (!('target' in row) || row.target.kind !== 'session' || row.target.sessionId !== id) throw new Error('NATIVE_SCHEDULE_UNOWNED');
          const edited = await ctx.schedule.edit({ id: ScheduleId(scheduleId), action: 'update', patch: { active: false } }, sessionId);
          if (!('status' in edited) || edited.status !== 'paused' && edited.status !== 'ended') throw new Error('NATIVE_SCHEDULE_DISABLE_FAILED');
        },
        async retireSchedule(scheduleId) {
          if (!knownSchedules.has(scheduleId)) throw new Error('NATIVE_SCHEDULE_UNOWNED');
          const row = await ctx.schedule.view({ id: ScheduleId(scheduleId) });
          if (!('target' in row) || row.target.kind !== 'session' || row.target.sessionId !== id) throw new Error('NATIVE_SCHEDULE_UNOWNED');
          const stopped = row.status === 'active' ? await ctx.schedule.edit({ id: ScheduleId(scheduleId), action: 'update', patch: { active: false } }, sessionId) : row;
          if (!('status' in stopped) || stopped.status !== 'paused' && stopped.status !== 'ended') throw new Error('NATIVE_SCHEDULE_DISABLE_FAILED');
          const deleted = await ctx.schedule.edit({ id: ScheduleId(scheduleId), action: 'delete' }, sessionId);
          if (!('deleted' in deleted) || deleted.deleted !== true) throw new Error('NATIVE_SCHEDULE_RETIRE_FAILED');
          knownSchedules.delete(scheduleId);
          return stopped;
        },
        async listSchedules() {
          const rows: ScheduleCatalogEntry[] = [];
          for (const scheduleId of knownSchedules) {
            const row = await ctx.schedule.view({ id: ScheduleId(scheduleId) });
            if ('target' in row && row.target.kind === 'session' && row.target.sessionId === id) rows.push(row);
          }
          return rows;
        },
        async refreshSchedules() {
          requireAdmission('schedule');
          if (binding.role !== 'main') throw new Error('NATIVE_WORKER_SCHEDULE_DENIED');
          if (!options.model?.provider || !options.model.model) throw new Error('NATIVE_UNCONFIGURED');
          for (const scheduleId of [...knownSchedules]) {
            requireAdmission('schedule');
            const row = await ctx.schedule.view({ id: ScheduleId(scheduleId) });
            requireAdmission('schedule');
            if (!('target' in row) || row.id !== scheduleId || row.target.kind !== 'session' || row.target.sessionId !== id) throw new Error('NATIVE_SCHEDULE_REFRESH_UNCONFIRMED');
            if (row.status === 'paused' || row.status === 'ended') continue;
            if (row.status !== 'active') throw new Error('NATIVE_SCHEDULE_REFRESH_UNCONFIRMED');
            // Same descriptive value preserves the native rule, committed occurrence and pending delivery.
            // Public edit re-drives native scheduling; this is never a manual run or a replacement task.
            const edited = await ctx.schedule.edit({ id: ScheduleId(scheduleId), action: 'update', expectedUpdatedAt: row.updatedAt ?? null, patch: { prompt: row.prompt } }, sessionId);
            requireAdmission('schedule');
            if ('code' in edited && edited.code === 'schedule_conflict') {
              // Native delivery may win the CAS. One exact read can prove that committed progress;
              // no management retry, delivery replay, or replacement Schedule is authorized here.
              if (edited.id === scheduleId) {
                requireAdmission('schedule');
                const current = await ctx.schedule.view({ id: ScheduleId(scheduleId) });
                requireAdmission('schedule');
                if ('target' in current && committedScheduleProgress(row, current, id)) continue;
              }
              const failure = new Error('NATIVE_SCHEDULE_REFRESH_UNCONFIRMED'); failure.name = 'NativeScheduleRefreshConflict'; throw failure;
            }
            if (!('target' in edited) || edited.id !== scheduleId || edited.target.kind !== 'session' || edited.target.sessionId !== id || !['active', 'ended'].includes(edited.status) || edited.kind !== row.kind || edited.prompt !== row.prompt || !Number.isFinite(Date.parse(edited.scheduledAt)) || Date.parse(edited.scheduledAt) < Date.parse(row.scheduledAt)) throw new Error('NATIVE_SCHEDULE_REFRESH_UNCONFIRMED');
          }
        },
      };
      handles.set(id, { native, public: publicHandle, options, canSchedule: () => admitted('schedule'), releaseReads });
      return publicHandle;
    } catch (error) { closed = true; await native.dispose(); throw error; }
  }

  return {
    open,
    async dispose() {
      stopping = true;
      resolveSchedule();
      await Promise.allSettled(opening.values());
      const results = await Promise.allSettled([...handles.values()].map((entry) => entry.public.dispose()));
      const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
      if(handles.size===0&&opening.size===0)stopModelGuard();
      if (errors.length) throw new AggregateError(errors, 'Native research shutdown failed');
    },
  };
}
