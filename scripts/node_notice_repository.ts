import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  createNoticeRepository,
  type NoticeDatabase,
} from '../src/db/noticeRepository';

export const nodeSha256 = async (text: string) =>
  createHash('sha256').update(text).digest('hex');
export async function openNodeNoticeRepository(path = ':memory:') {
  const db = new DatabaseSync(path);
  const adapter: NoticeDatabase = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      return { changes: Number(db.prepare(sql).run(...params).changes) };
    },
    async getFirstAsync<T>(
      sql: string,
      params: (string | number | null)[] = [],
    ) {
      return (db.prepare(sql).get(...params) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, params: (string | number | null)[] = []) {
      return db
        .prepare(sql)
        .all(...params)
        .map((row) => ({ ...row }) as T);
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  try {
    return {
      db,
      repository: await createNoticeRepository(adapter, {
        randomUUID,
        sha256: nodeSha256,
      }),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
