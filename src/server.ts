import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { SentiStore } from './store.ts';
import { StoreError } from './domain.ts';
import type { Owner, Delegation } from './domain.ts';
import type { LifecycleControlPort } from './control.ts';
import { ControlDelivery, inactiveControlPort } from './control.ts';
import { acquireHostLease } from './lease.ts';
import type {OperatorResponseInput} from './decisions.ts';

export interface LocalHostOptions {
  store: SentiStore;
  owner: Owner;
  port?: number;
  controlPort?: LifecycleControlPort;
  researchPort?: {
    status: { status: string; message: string };
    detail(id: string): Record<string, unknown>;
    changed(id: string): void;
    respondDecision?(id: string, input: OperatorResponseInput): Promise<unknown>;
    pauseResearch?(id: string, input: {expectedVersion:number;mode:'all'|'direction';scope?:string;reason:string;idempotencyKey:string}): unknown;
    resumeResearch?(id: string, input: {expectedVersion:number;scope?:string;reason:string;idempotencyKey:string}): unknown;
    scheduleResume?(id: string, input: {expectedRevision:number;at:string;reason:string;idempotencyKey:string}): Promise<unknown>;
    scheduleEnd?(id: string, input: {expectedRevision:number;at:string;reason:string;idempotencyKey:string}): Promise<unknown>;
    configureNotificationPreferences?(id: string, input: {timeZone:string;time:string;weekdays:number[]}, expectedRevision:number): unknown;
  };
}

export async function startLocalHost(options: LocalHostOptions) {
  const owner = Object.freeze({ ...options.owner });
  const controlPort = options.controlPort ?? inactiveControlPort;
  const runtime = options.researchPort?.status ?? controlPort.status;
  const release = acquireHostLease(options.store);
  let controls: ControlDelivery;
  try { controls = new ControlDelivery(options.store, owner, controlPort); }
  catch (error) { release(); throw error; }
  const detail = (delegation: Delegation) => {
    const projection = options.researchPort?.detail(delegation.id) ?? {};
    return {
      delegation: { ...delegation, research: projection.researchStatus ?? delegation.research },
      history: delegation.revisions, messages: delegation.messages, runtime,
      research: [], artifacts: [], decisions: [], outcomes: [], learning: [], sources: [],
      ...projection,
    };
  };
  const notifyChanged = (id: string): void => {
    const failed = () => process.stderr.write('SentiScope saved the delegation; research follow-up requires reconciliation.\n');
    try {
      const pending = options.researchPort?.changed(id) as unknown;
      if (pending && typeof (pending as { then?: unknown }).then === 'function') void Promise.resolve(pending).catch(failed);
    } catch { failed(); }
  };
  const server = createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    void (async () => {
      checkLocalRequest(request);
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/api/health') return json(response, 200, { status: 'ok', mode: 'local-development', runtime, call: 'not_connected' });
      const staticFiles: Record<string, { file: string; mime: string }> = {
        '/': { file: 'index.html', mime: 'text/html' },
        '/index.html': { file: 'index.html', mime: 'text/html' },
        '/styles.css': { file: 'styles.css', mime: 'text/css' },
        '/app.js': { file: 'app.js', mime: 'text/javascript' },
        '/favicon.svg': { file: 'favicon.svg', mime: 'image/svg+xml' },
      };
      if (request.method === 'GET' && Object.hasOwn(staticFiles, pathname)) {
        const asset = staticFiles[pathname];
        const content = await readFile(new URL(`./web/${asset.file}`, import.meta.url));
        response.writeHead(200, { 'Content-Type': `${asset.mime}; charset=utf-8`, 'Cache-Control': 'no-store' });
        response.end(content); return;
      }
      if (pathname === '/api/delegations' && request.method === 'GET') {
        const delegations = options.store.list(owner).map((delegation) => {
          const projection=options.researchPort?.detail(delegation.id);
          return {...delegation,research:projection?.researchStatus??delegation.research,pendingDecisions:projection?.pendingDecisions??[],notificationFeed:projection?.notificationFeed??{matters:[],briefs:[],notices:[],checkState:null}};
        });
        return json(response, 200, { delegations, runtime });
      }
      if (pathname === '/api/delegations' && request.method === 'POST') {
        const body = await readObject(request);
        onlyFields(body, ['goal', 'boundary', 'relatedTo', 'idempotencyKey']);
        const created = options.store.create(owner, {
          goal: body.goal as string, boundary: body.boundary as string | undefined,
          relatedTo: body.relatedTo as string | undefined, idempotencyKey: body.idempotencyKey as string,
        });
        notifyChanged(created.id);
        return json(response, 201, detail(created));
      }
      const match = /^\/api\/delegations\/([^/]+)$/.exec(pathname);
      if (match && request.method === 'GET') return json(response, 200, detail(options.store.get(owner, decodeURIComponent(match[1]))));
      const command = /^\/api\/delegations\/([^/]+)\/commands$/.exec(pathname);
      if (command && request.method === 'POST') {
        const id = decodeURIComponent(command[1]);
        const body = await readObject(request);
        const shared = { expectedVersion: body.expectedVersion as number, idempotencyKey: body.idempotencyKey as string };
        if(body.kind==='decision_response') {
          onlyFields(body,['kind','id','revision','artifact','requestId','action','optionId','scope','text']);
          options.store.scope(owner,id);
          if(!options.researchPort?.respondDecision)throw new StoreError('decision_unavailable','待决回应接缝尚未就绪，未记录新的选择。',503);
          const {kind:_kind,...input}=body;
          await options.researchPort.respondDecision(id,input as unknown as OperatorResponseInput);
          notifyChanged(id);
          return json(response,200,detail(options.store.get(owner,id)));
        }
        if (body.kind === 'adjust') {
          onlyFields(body, ['kind', 'expectedVersion', 'idempotencyKey', 'goal', 'boundary']);
          const adjusted = options.store.adjust(owner, id, { ...shared, goal: body.goal as string, boundary: body.boundary as string | undefined });
          notifyChanged(id);
          return json(response, 200, detail(adjusted));
        }
        if (body.kind === 'message') {
          onlyFields(body, ['kind', 'expectedVersion', 'idempotencyKey', 'text']);
          const updated = options.store.appendMessage(owner, id, { ...shared, text: body.text as string });
          notifyChanged(id);
          return json(response, 200, detail(updated));
        }
        if (body.kind === 'research_control') {
          onlyFields(body, ['kind', 'expectedVersion', 'action', 'mode', 'scope', 'reason', 'at', 'idempotencyKey']);
          const action = body.action as 'pause'|'resume'|'schedule_resume'|'schedule_end';
          const shared = { expectedVersion: Number(body.expectedVersion), reason: String(body.reason ?? ''), idempotencyKey: String(body.idempotencyKey) };
          if (action === 'pause' && options.researchPort?.pauseResearch) options.researchPort.pauseResearch(id, { ...shared, mode: body.mode as 'all'|'direction', scope: body.scope as string | undefined });
          else if (action === 'resume' && options.researchPort?.resumeResearch) options.researchPort.resumeResearch(id, { ...shared, scope: body.scope as string | undefined });
          else if (action === 'schedule_resume' && options.researchPort?.scheduleResume) await options.researchPort.scheduleResume(id, { expectedRevision: shared.expectedVersion, at: String(body.at), reason: shared.reason, idempotencyKey: shared.idempotencyKey });
          else if (action === 'schedule_end' && options.researchPort?.scheduleEnd) await options.researchPort.scheduleEnd(id, { expectedRevision: shared.expectedVersion, at: String(body.at), reason: shared.reason, idempotencyKey: shared.idempotencyKey });
          else throw new StoreError('research_control_unavailable', '细粒度生命周期控制尚未就绪。', 503);
          notifyChanged(id);
          return json(response, 200, detail(options.store.get(owner, id)));
        }
        if (body.kind === 'notification_preferences') {
          onlyFields(body, ['kind', 'expectedRevision', 'timeZone', 'time', 'weekdays', 'idempotencyKey']);
          if(!options.researchPort?.configureNotificationPreferences)throw new StoreError('notification_preferences_unavailable', '简报偏好配置尚未就绪。', 503);
          options.researchPort.configureNotificationPreferences(id, { timeZone: String(body.timeZone), time: String(body.time), weekdays: body.weekdays as number[] }, Number(body.expectedRevision));
          notifyChanged(id);
          return json(response, 200, detail(options.store.get(owner, id)));
        }
        if (body.kind === 'pause' || body.kind === 'resume' || body.kind === 'end') {
          onlyFields(body, ['kind', 'expectedVersion', 'idempotencyKey']);
          const action = body.kind;
          const accepted = options.store.withTransaction(() => {
            const delegation = options.store.requestLifecycle(owner, id, { ...shared, action });
            const dispatch = controls.record(delegation, shared.expectedVersion, action);
            return { delegation, dispatch };
          });
          json(response, 200, detail(accepted.delegation));
          if (accepted.dispatch && accepted.delegation.pendingOperation) {
            void controls.dispatch(id, accepted.delegation.pendingOperation).catch(() => {
              // A failed durable write cannot be made successful by a retry. Restart reconciliation preserves UNKNOWN.
              process.stderr.write('SentiScope control receipt could not be persisted; manual state reconciliation required.\n');
            });
          }
          return;
        }
        throw new StoreError('invalid_input', '不支持该委托动作。');
      }
      throw new StoreError('not_found', '未找到该入口。', 404);
    })().catch((error: unknown) => {
      const known = error instanceof StoreError;
      json(response, known ? error.status : 500, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : '保存结果暂不可确认，请先核对当前记录。' } });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  }).catch((error: unknown) => { release(); throw error; });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local server address unavailable');
  void controls.recoverRecorded().catch(() => {
    process.stderr.write('SentiScope committed control intents require reconciliation.\n');
  });
  let closing: Promise<void> | undefined;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close(): Promise<void> {
      return closing ??= (async () => {
        controls.close();
        server.closeAllConnections();
        try { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
        finally { release(); }
      })();
    },
  };
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new StoreError('unsupported_media', '请使用 JSON 提交。', 415);
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    bytes += chunk.length;
    if (bytes > 64 * 1024) throw new StoreError('too_large', '本次提交内容过大。', 413);
    chunks.push(chunk);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new StoreError('invalid_json', '提交内容不是有效 JSON。'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StoreError('invalid_input', '提交内容须为对象。');
  return body as Record<string, unknown>;
}

function onlyFields(body: Record<string, unknown>, fields: readonly string[]) {
  if (Object.keys(body).some((key) => !fields.includes(key))) throw new StoreError('invalid_input', '提交包含未支持的字段；身份与运行资格只能由 Host 绑定。');
}

function checkLocalRequest(request: IncomingMessage) {
  const host = `127.0.0.1:${request.socket.localPort}`;
  if (request.headers.host !== host || (request.headers.origin !== undefined && request.headers.origin !== `http://${host}`)
    || ![undefined, 'same-origin', 'none'].includes(request.headers['sec-fetch-site'] as string | undefined)) {
    throw new StoreError('forbidden_origin', '当前仅支持本机工作台的同源访问。', 403);
  }
}
