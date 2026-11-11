import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { PAPER_POSITIONS_SCHEMA, PAPER_SIGNALS_SCHEMA, PAPER_STATUS_INDEX, PAPER_OPEN_TIME_INDEX } from '@/db/schema';
let database: Database.Database;
export function paperDb() {
  if (!database) {
    const dir = process.env.MANJU_STATE_DIR || './data';
    mkdirSync(dir, { recursive: true });
    database = new Database(`${dir}/paper.sqlite3`);
    database.pragma('journal_mode = WAL');
    database.exec([PAPER_POSITIONS_SCHEMA, PAPER_SIGNALS_SCHEMA, PAPER_STATUS_INDEX, PAPER_OPEN_TIME_INDEX].join(';'));
  }
  const wrap = (sql: string, values: any[] = []) => ({
    bind: (...args: any[]) => wrap(sql, args),
    run: async () => ({ meta: { changes: database.prepare(sql).run(...values).changes } }),
    first: async <T,>() => database.prepare(sql).get(...values) as T | undefined,
    all: async <T,>() => ({ results: database.prepare(sql).all(...values) as T[] }),
  });
  return { prepare: (sql: string) => wrap(sql), raw: database };
}
export async function ensurePaperDb() { return paperDb(); }
