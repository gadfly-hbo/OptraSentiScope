import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SentiStore } from './store.ts';
import { startLocalHost } from './server.ts';

// Engineering entrypoint only. Enterprise authentication, native research and deployment remain separate.
process.umask(0o077);
const dataDirectory = resolve(process.env.SENTISCOPE_DATA_DIR ?? '.local/product');
mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
const port = Number(process.env.SENTISCOPE_PORT ?? '8766');
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('SENTISCOPE_PORT must be a valid local port.');
const owner = Object.freeze({
  enterpriseId: process.env.SENTISCOPE_ENTERPRISE_ID ?? 'local-enterprise',
  principalId: process.env.SENTISCOPE_PRINCIPAL_ID ?? 'local-operator',
});
const operatorTokenHash = process.env.SENTISCOPE_OPERATOR_TOKEN_HASH;
const maintainerTokenHash = process.env.SENTISCOPE_MAINTAINER_TOKEN_HASH;
if (!operatorTokenHash || !maintainerTokenHash) throw new Error('SENTISCOPE_OPERATOR_TOKEN_HASH and SENTISCOPE_MAINTAINER_TOKEN_HASH are required for the local workbench.');
const store = new SentiStore({ filename: join(dataDirectory, 'business.sqlite') });
const host = await startLocalHost({ store, owner, port, auth: { operatorTokenHash, maintainerTokenHash } });
process.stdout.write(`OptraSentiScope 经营者工作台：${host.url}\n本地工程入口；委托已持久化，官方研究运行尚未接通。\n`);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await host.close(); store.close();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  void shutdown().catch(() => { process.stderr.write('Host shutdown state requires reconciliation.\n'); process.exitCode = 1; });
});
