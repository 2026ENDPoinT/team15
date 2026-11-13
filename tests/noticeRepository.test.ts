import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  changedNoticeFixture,
  normalNoticeFixture,
} from '../fixtures/synthetic/notices';
import {
  createNoticeRepository,
  type NoticeDatabase,
} from '../src/db/noticeRepository';
import { createNoticeActions } from '../src/services/noticeActions';

function adaptDatabase(db: DatabaseSync): NoticeDatabase {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      const { changes } = db.prepare(sql).run(...params);
      return { changes: Number(changes) };
    },
    async getFirstAsync<T>(sql: string) {
      return (db.prepare(sql).get() ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string) {
      return db
        .prepare(sql)
        .all()
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
}

test('저장한 샘플 공지는 중복 저장과 원문 갱신 후 DB를 다시 열어도 한 건이다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'team15-notices-'));
  const path = join(dir, 'notices.db');
  const original = normalNoticeFixture.notice;
  const updated = {
    ...changedNoticeFixture.notice,
    fetchedAt: '2026-11-13T10:00:00.500Z',
  };
  let db = new DatabaseSync(path);

  try {
    let repository = await createNoticeRepository(adaptDatabase(db));
    const actions = createNoticeActions(repository);
    await repository.upsertRawNotice(original);
    await Promise.all([
      actions.saveNotice(original.id),
      actions.saveNotice(original.id),
    ]);
    const saved = await repository.listSavedNotices();
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.id, original.id);
    assert.equal(saved[0]?.progress, 'saved');

    await repository.upsertRawNotice(updated);
    await repository.upsertRawNotice(original);
    db.close();

    db = new DatabaseSync(path);
    repository = await createNoticeRepository(adaptDatabase(db));
    assert.deepEqual(await repository.listSavedNotices(), saved);
    const row = db
      .prepare('SELECT content_hash FROM notices WHERE id = ?')
      .get(original.id);
    assert.equal(row?.content_hash, updated.contentHash);
  } finally {
    db.close();
    unlinkSync(path);
    rmdirSync(dir);
  }
});
