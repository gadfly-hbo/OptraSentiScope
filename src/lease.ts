import { randomUUID } from 'node:crypto';
import { StoreError } from './domain.ts';
import type { SentiStore } from './store.ts';

/** A single local Host owns reconciliation. This does not prove native children have stopped. */
export function acquireHostLease(store: SentiStore): () => void {
  const db = store.connection;
  db.exec('CREATE TABLE IF NOT EXISTS host_lease (singleton INTEGER PRIMARY KEY CHECK(singleton=1), pid INTEGER NOT NULL, token TEXT NOT NULL)');
  const previous = db.prepare('SELECT pid, token FROM host_lease WHERE singleton=1').get() as { pid: number; token: string } | undefined;
  if (previous && processIsAlive(previous.pid)) throw new StoreError('host_busy', '已有存活 Host 占用该业务库；不能接管或重判它的在途控制。', 409);
  const token = randomUUID();
  store.withTransaction(() => {
    const current = db.prepare('SELECT token FROM host_lease WHERE singleton=1').get() as { token: string } | undefined;
    if (current?.token !== previous?.token) throw new StoreError('host_busy', '业务库正在由另一 Host 接管。', 409);
    db.prepare('INSERT INTO host_lease VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET pid=excluded.pid, token=excluded.token').run(process.pid, token);
  });
  return () => { db.prepare('DELETE FROM host_lease WHERE singleton=1 AND token=?').run(token); };
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
