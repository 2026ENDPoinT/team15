import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
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
import {
  createReminderReconciler,
  type ReminderPlatform,
} from '../src/services/reminderReconciler';

function adaptDatabase(db: DatabaseSync): NoticeDatabase {
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      const { changes } = db.prepare(sql).run(...params);
      return { changes: Number(changes) };
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
}

function openRepository(db: DatabaseSync) {
  return createNoticeRepository(adaptDatabase(db), {
    randomUUID,
    async sha256(text) {
      return createHash('sha256').update(text).digest('hex');
    },
  });
}

test('마감 변경 확인과 알림 갱신은 최신 분석을 사용하며 취소 실패는 재시도한다', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repository = await openRepository(db);
    const scheduled = new Map<
      string,
      Awaited<ReturnType<ReminderPlatform['listScheduled']>>[number]
    >();
    let nextId = 0;
    let failCancel = false;
    const reconcile = createReminderReconciler(
      repository,
      {
        async isAllowed() {
          return true;
        },
        async listScheduled() {
          return [...scheduled.values()];
        },
        async cancel(identifier) {
          if (failCancel) throw new Error('cancel failed');
          scheduled.delete(identifier);
        },
        async schedule(request) {
          const identifier = String(++nextId);
          scheduled.set(identifier, { ...request, identifier });
          return identifier;
        },
      },
      () => new Date('2026-11-13T16:00:00Z'),
    );
    const actions = createNoticeActions(repository, reconcile);
    const { notice, analysis } = normalNoticeFixture;
    await repository.upsertRawNotice(notice);
    await repository.applyAnalysis(analysis);
    await actions.saveNotice(notice.id);
    await Promise.all([reconcile(), reconcile()]);
    assert.equal(scheduled.size, 1);
    assert.equal(scheduled.get('1')?.fireAt, '2026-11-19T00:00:00.000Z');
    assert.equal(
      (await repository.getHomeModel(new Date('2026-11-13T16:00:00Z')))
        .schedule[0]?.daysLeft,
      6,
    );
    assert.equal(
      (await repository.getNoticeDetail(notice.id))?.deadlineChanged,
      false,
    );

    await repository.upsertRawNotice(changedNoticeFixture.notice);
    assert.equal(
      (await repository.getNoticeDetail(notice.id))?.analysisFresh,
      false,
    );
    assert.deepEqual((await repository.getHomeModel()).schedule, []);
    failCancel = true;
    await reconcile();
    assert.equal((await repository.listReminders())[0]?.state, 'error');
    assert.equal((await repository.listReminders())[0]?.identifier, '1');
    assert.equal(scheduled.size, 1);

    await repository.applyAnalysis(changedNoticeFixture.analysis);
    assert.equal(
      (await repository.getNoticeDetail(notice.id))?.deadlineChanged,
      true,
    );
    failCancel = false;
    await reconcile();
    assert.equal(scheduled.size, 1);
    assert.equal(scheduled.get('2')?.fireAt, '2026-11-22T00:00:00.000Z');
    await actions.acknowledgeDeadlineChange(notice.id);
    assert.equal(
      (await repository.getNoticeDetail(notice.id))?.deadlineChanged,
      false,
    );

    await actions.setProgress(notice.id, 'applied');
    await reconcile();
    assert.equal(scheduled.size, 0);
    assert.equal((await repository.listReminders())[0]?.identifier, null);
    assert.ok(
      (await repository.getHomeModel()).schedule.some(
        ({ type }) => type === 'event_start',
      ),
    );
  } finally {
    db.close();
  }
});

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
    let repository = await openRepository(db);
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
    repository = await openRepository(db);
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

test('관심 해제 후 다시 저장하면 신청 상태와 체크 기록이 복원된다', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repository = await openRepository(db);
    const actions = createNoticeActions(repository);
    const notice = normalNoticeFixture.notice;
    await repository.upsertRawNotice(notice);
    await actions.setProgress(notice.id, 'applied');
    await actions.saveNotice(notice.id);
    assert.equal((await repository.listSavedNotices())[0]?.progress, 'saved');
    await actions.setProgress(notice.id, 'preparing');
    assert.equal(
      (await repository.listSavedNotices())[0]?.progress,
      'preparing',
    );
    await actions.setProgress(notice.id, 'applied');

    db.prepare(
      `INSERT INTO checklist_items (id, notice_id, text, evidence, completed, created_at)
       VALUES ('item-1', ?, '신청서 준비', '제출 서류는 신청서입니다.', 1, ?)`,
    ).run(notice.id, notice.fetchedAt);

    await actions.unsaveNotice(notice.id);
    await actions.unsaveNotice(notice.id);
    await actions.setProgress(notice.id, 'preparing');
    assert.deepEqual(await repository.listSavedNotices(), []);

    await actions.saveNotice(notice.id);
    const saved = await repository.listSavedNotices();
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.progress, 'applied');
    assert.equal(
      db
        .prepare('SELECT completed FROM checklist_items WHERE id = ?')
        .get('item-1')?.completed,
      1,
    );
  } finally {
    db.close();
  }
});

for (const saveFirst of [true, false]) {
  test(`체크리스트는 ${saveFirst ? '저장' : '분석'}이 먼저여도 한 번 생성되고 재분석 후 체크를 보존한다`, async () => {
    const db = new DatabaseSync(':memory:');
    try {
      const repository = await openRepository(db);
      const actions = createNoticeActions(repository);
      const { notice, analysis } = normalNoticeFixture;
      await repository.upsertRawNotice(notice);
      if (saveFirst) {
        await actions.saveNotice(notice.id);
        assert.deepEqual(await repository.getChecklist(notice.id), {
          items: [],
          updatedChecklist: null,
        });
      }
      assert.equal(await repository.applyAnalysis(analysis), true);
      await actions.saveNotice(notice.id);
      const { items, updatedChecklist } = await repository.getChecklist(
        notice.id,
      );
      assert.equal(items.length, analysis.data.checklist.length);
      assert.equal(updatedChecklist, null);
      const first = items[0];
      assert.ok(first);
      await actions.setChecklistCompleted(first.id, true);
      await repository.applyAnalysis(analysis);

      await repository.upsertRawNotice(changedNoticeFixture.notice);
      assert.equal(await repository.applyAnalysis(analysis), false);
      assert.equal(
        (await repository.getChecklist(notice.id)).updatedChecklist,
        null,
      );
      assert.equal(
        await repository.applyAnalysis(changedNoticeFixture.analysis),
        true,
      );
      const after = await repository.getChecklist(notice.id);
      assert.deepEqual(after.items, [
        { ...first, completed: true },
        ...items.slice(1),
      ]);
      assert.deepEqual(
        after.updatedChecklist,
        changedNoticeFixture.analysis.data.checklist,
      );
    } finally {
      db.close();
    }
  });
}

test('단과대학, 내 정보와 키워드를 저장하고 DB 재실행 후 복원한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'campus-profile-'));
  const file = join(dir, 'profile.db');
  let db = new DatabaseSync(file);
  try {
    const repository = await openRepository(db);
    assert.equal(await repository.getProfile(), null);
    const profile = {
      college: '정보통신대학',
      department: '전자공학과',
      grade: 2,
      enrollment: 'leave',
      keywords: ['인공지능', '멘토링'],
      customKeywords: ['멘토링', '스터디'],
    } as const;
    const saved = {
      ...profile,
      keywords: [...profile.keywords],
      customKeywords: [...profile.customKeywords],
    };
    await repository.saveProfile(saved);
    db.close();
    db = new DatabaseSync(file);
    const reopened = await openRepository(db);
    assert.deepEqual(await reopened.getProfile(), saved);
    await reopened.saveProfile({ ...saved, college: null });
    assert.deepEqual(await reopened.getProfile(), { ...saved, college: null });
  } finally {
    db.close();
    unlinkSync(file);
    rmdirSync(dir);
  }
});

test('영구 삭제는 휴지통에만 적용되고 재수집 및 저장소 재초기화 후에도 복원되지 않는다', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    let repository = await openRepository(db);
    const { notice } = normalNoticeFixture;
    await repository.upsertRawNotice(notice);
    await repository.deleteNotice(notice.id);
    assert.equal((await repository.listNoticeRecords()).length, 1);
    await repository.dismissNotice(notice.id);
    await repository.restoreNotice(notice.id);
    assert.equal(
      (await repository.listNoticeRecords())[0]?.disposition,
      'unseen',
    );
    await repository.dismissNotice(notice.id);
    await repository.deleteNotice(notice.id);
    assert.equal((await repository.listNoticeRecords()).length, 0);
    await repository.upsertRawNotice(notice);
    repository = await openRepository(db);
    await repository.restoreNotice(notice.id);
    assert.equal((await repository.listNoticeRecords()).length, 0);
  } finally {
    db.close();
  }
});

test('analysis tags accumulate independently of notice deletion and survive reopening', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    let repository = await openRepository(db);
    const { notice, analysis } = normalNoticeFixture;
    await repository.upsertRawNotice(notice);
    assert.equal(
      await repository.applyAnalysis({
        ...analysis,
        content_hash: '0'.repeat(64),
        data: { ...analysis.data, tags: ['rejected'] },
      }),
      false,
    );
    assert.deepEqual(await repository.listDiscoveredKeywords(), []);
    await repository.applyAnalysis({
      ...analysis,
      data: { ...analysis.data, tags: ['new topic', 'new topic', ' second '] },
    });
    assert.deepEqual(await repository.listDiscoveredKeywords(), [
      'new topic',
      'second',
    ]);
    assert.equal(await repository.getProfile(), null);
    await repository.dismissNotice(notice.id);
    await repository.deleteNotice(notice.id);
    repository = await openRepository(db);
    assert.deepEqual(await repository.listDiscoveredKeywords(), [
      'new topic',
      'second',
    ]);
  } finally {
    db.close();
  }
});

test('version four migration imports existing fresh analysis tags', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repository = await openRepository(db);
    const { notice, analysis } = normalNoticeFixture;
    await repository.upsertRawNotice(notice);
    await repository.applyAnalysis(analysis);
    db.exec('DROP TABLE discovered_keywords; PRAGMA user_version = 4;');
    const migrated = await openRepository(db);
    assert.deepEqual(await migrated.listDiscoveredKeywords(), [
      ...new Set(analysis.data.tags.map((tag) => tag.trim())),
    ]);
  } finally {
    db.close();
  }
});

test('메인에서 버린 저장 공지는 휴지통으로 이동하고 알림을 다시 동기화한다', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const repository = await openRepository(db);
    let reconciliations = 0;
    const actions = createNoticeActions(repository, async () => {
      reconciliations++;
    });
    const { notice, analysis } = normalNoticeFixture;
    await repository.upsertRawNotice(notice);
    await repository.applyAnalysis(analysis);
    await repository.saveNotice(notice.id);
    await repository.setProgress(notice.id, 'preparing');
    const checklist = await repository.getChecklist(notice.id);
    await actions.dismissNotice(notice.id);
    assert.equal(
      (await repository.getNoticeDetail(notice.id))?.disposition,
      'dismissed',
    );
    assert.deepEqual(await repository.listSavedNotices(), []);
    assert.equal(reconciliations, 1);
    await repository.restoreNotice(notice.id);
    await repository.saveNotice(notice.id);
    assert.equal(
      (await repository.getNoticeDetail(notice.id))?.progress,
      'preparing',
    );
    assert.deepEqual(await repository.getChecklist(notice.id), checklist);
  } finally {
    db.close();
  }
});
