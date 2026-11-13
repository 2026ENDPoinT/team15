import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  normalNoticeFixture,
  changedNoticeFixture,
} from '../fixtures/synthetic/notices';
import verified from '../fixtures/real/worker/t05_verified.json';
import type { CollectedNotice, AnalysisEnvelope } from '../shared/contracts';
import {
  openNodeNoticeRepository,
  nodeSha256,
} from '../scripts/node_notice_repository';
import {
  createAnalysisClient,
  AnalysisClientError,
} from '../src/services/analysisClient';
import { createNoticeSync } from '../src/services/noticeSync';
import type { collectSource, CollectionResult } from '../src/sources/collector';
import { migration1 } from '../src/db/migrations';
import { DatabaseSync } from 'node:sqlite';
import { toNoticeCard } from '../src/features/demo/noticeReadModel';

const live = (notice: CollectedNotice): CollectedNotice => ({
  ...notice,
  sourceUrl: `https://computer.seoultech.ac.kr/info/notice?do=view&bnum=58476&bidx=${notice.postId}`,
});
const normal = live(normalNoticeFixture.notice);
const changed = live(changedNoticeFixture.notice);
function source(
  notices: CollectedNotice[],
  failures: CollectionResult['failures'] = [],
): typeof collectSource {
  return async (sourceId, dependencies, options) => {
    const matching = notices.filter((notice) => notice.sourceId === sourceId);
    for (const notice of matching) await options?.onNotice?.(notice);
    return {
      sourceId,
      attemptedAt: dependencies.now!().toISOString(),
      completedAt: dependencies.now!().toISOString(),
      status: failures.length ? 'partial' : 'success',
      notices: matching,
      failures,
    };
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('실제 HTML 두 출처 → HTTP 클라이언트 → SQLite → 체크·일정, 동일 입력은 AI 캐시를 재사용한다', async () => {
  const { db, repository } = await openNodeNoticeRepository();
  try {
    let time = new Date('2026-11-13T15:00:00Z');
    let calls = 0;
    let visibleBeforeAnalysis = false;
    const client = createAnalysisClient({
      getToken: async () => 'test-only-token',
      fetch: async (_url, init) => {
        calls++;
        const request = JSON.parse(String(init?.body));
        const captured = verified.results.find(
          ({ envelope }) => envelope.notice_id === request.notice_id,
        )!;
        assert.equal(captured.envelope.content_hash, request.content_hash);
        return Response.json(captured.envelope);
      },
    });
    const sync = createNoticeSync({
      repository,
      randomUUID,
      now: () => time,
      keywords: () => ['부산', '멘토링'],
      analyze: client,
      collector: {
        sha256: nodeSha256,
        fetch: async (url) => {
          const parsed = new URL(String(url));
          const prefix = parsed.hostname.startsWith('computer')
            ? 'cs'
            : 'general';
          if (
            parsed.searchParams.has('do') &&
            !['897750', '897737'].includes(parsed.searchParams.get('bidx')!)
          )
            return new Response('unavailable', { status: 503 });
          const kind = parsed.searchParams.has('do')
            ? 'detail'
            : parsed.searchParams.get('page') === '2'
              ? 'page2'
              : 'list';
          return new Response(
            readFileSync(
              `fixtures/real/seoultech/${prefix}_${kind}.html`,
              'utf8',
            ),
            { headers: { 'Content-Type': 'text/html' } },
          );
        },
      },
      onDataChange: async () => {
        for (const record of await repository.listNoticeRecords()) {
          if (!record.analysisFresh && record.disposition !== 'saved') {
            visibleBeforeAnalysis = true;
            await repository.saveNotice(record.notice.id);
          }
        }
      },
    });
    const first = sync.refreshNotices('manual');
    assert.equal(sync.refreshNotices('manual'), first);
    await first;
    assert.equal(visibleBeforeAnalysis, true);
    assert.equal(calls, 2);
    const records = await repository.listNoticeRecords();
    assert.equal(records.length, 2);
    assert.ok(records.every(({ analysisFresh }) => analysisFresh));
    const cs = records.find(
      ({ notice }) => notice.sourceId === 'seoultech_cs',
    )!;
    const checklist = await repository.getChecklist(cs.notice.id);
    assert.ok(checklist.items.length > 0);
    await repository.setChecklistCompleted(checklist.items[0]!.id, true);
    const schedule = (await repository.getHomeModel()).schedule;
    assert.ok(schedule.some((event) => event.date === '2026-12-14'));
    assert.ok(schedule.every((event) => event.type !== 'application_close'));
    const card = toNoticeCard(
      cs,
      (await repository.getNoticeDetail(cs.notice.id))!,
    );
    assert.equal(card.synthetic, false);
    assert.equal(card.date, null);
    time = new Date(time.getTime() + 31_000);
    await sync.refreshNotices('manual');
    assert.equal(calls, 2);
    assert.equal(
      (await repository.getChecklist(cs.notice.id)).items[0]!.completed,
      true,
    );
    assert.equal(
      (await repository.getChecklist(cs.notice.id)).items[0]!.id,
      checklist.items[0]!.id,
    );
    assert.ok(
      (await repository.getSyncState()).sources.every(
        (state) => state.lastSuccessAt === null && state.detailFailures > 0,
      ),
    );
  } finally {
    db.close();
  }
});

test('H1 응답이 대기하는 동안 H2 원문이 도착하면 성공·실패 모두 최신 작업을 덮지 않는다', async () => {
  const { db, repository } = await openNodeNoticeRepository();
  try {
    await repository.upsertRawNotice(normal);
    const started = deferred<void>();
    const result = deferred<AnalysisEnvelope>();
    const sync = createNoticeSync({
      repository,
      randomUUID,
      collector: { sha256: nodeSha256 },
      analyze: async () => {
        started.resolve();
        return result.promise;
      },
    });
    const work = sync.analyzeNotice(normal.id);
    await started.promise;
    await repository.upsertRawNotice(changed);
    result.resolve(normalNoticeFixture.analysis);
    await work;
    assert.equal((await repository.getNoticeDetail(normal.id))!.analysis, null);
    assert.equal(
      (await repository.getNoticeDetail(normal.id))!.analysisStatus,
      'pending',
    );
    const oldKey = {
      noticeId: changed.id,
      contentHash: changed.contentHash,
      requestId: 'old',
    };
    const newKey = { ...oldKey, requestId: 'new' };
    await repository.beginAnalysis(oldKey);
    await repository.beginAnalysis(newKey);
    assert.equal(
      await repository.failAnalysis(oldKey, 'failed', 'TIMEOUT'),
      false,
    );
    assert.equal(
      await repository.applyAnalysis(changedNoticeFixture.analysis, oldKey),
      false,
    );
    assert.equal(
      (await repository.getNoticeDetail(normal.id))!.analysisStatus,
      'running',
    );
    assert.equal(
      await repository.applyAnalysis(changedNoticeFixture.analysis, newKey),
      true,
    );
  } finally {
    db.close();
  }
});

test('본문 변경 후 분석 실패에도 체크 UUID·완료·신청 상태를 보존하고 오래된 일정은 먼저 제거한다', async () => {
  const { db, repository } = await openNodeNoticeRepository();
  try {
    await repository.upsertRawNotice(normal);
    await repository.applyAnalysis(normalNoticeFixture.analysis);
    await repository.saveNotice(normal.id);
    await repository.setProgress(normal.id, 'preparing');
    const item = (await repository.getChecklist(normal.id)).items[0]!;
    await repository.setChecklistCompleted(item.id, true);
    let reconciledBeforeAI = false;
    const sync = createNoticeSync({
      repository,
      randomUUID,
      collector: { sha256: nodeSha256 },
      collectSource: source([changed]),
      reconcileReminders: async () => {
        reconciledBeforeAI =
          (await repository.getHomeModel()).schedule.length === 0;
      },
      analyze: async () => {
        assert.equal(reconciledBeforeAI, true);
        throw new AnalysisClientError('PROVIDER_UNAVAILABLE');
      },
    });
    await sync.refreshNotices('manual');
    const detail = (await repository.getNoticeDetail(normal.id))!;
    assert.equal(detail.analysisFresh, false);
    assert.equal(detail.analysis?.content_hash, normal.contentHash);
    assert.equal(detail.analysisStatus, 'failed');
    assert.equal(detail.progress, 'preparing');
    assert.deepEqual((await repository.getChecklist(normal.id)).items[0], {
      ...item,
      completed: true,
    });
  } finally {
    db.close();
  }
});

test('저장한 공지는 목록 밖에서도 재수집하고 한 출처 실패가 다른 출처 성공 시각을 막지 않는다', async () => {
  const { db, repository } = await openNodeNoticeRepository();
  try {
    await repository.upsertRawNotice(normal);
    await repository.saveNotice(normal.id);
    let detailCalls = 0;
    const sync = createNoticeSync({
      repository,
      randomUUID,
      collector: { sha256: nodeSha256 },
      collectSource: async (sourceId, dependencies) => ({
        sourceId,
        attemptedAt: dependencies.now!().toISOString(),
        completedAt: dependencies.now!().toISOString(),
        notices: [],
        status: sourceId === 'seoultech_general' ? 'failed' : 'success',
        failures:
          sourceId === 'seoultech_general'
            ? [
                {
                  stage: 'list',
                  url: 'https://example.invalid',
                  noticeId: null,
                  code: 'NETWORK_ERROR',
                  message: 'failed',
                },
              ]
            : [],
      }),
      collectDetail: async () => {
        detailCalls++;
        return changed;
      },
      analyze: async () => changedNoticeFixture.analysis,
    });
    await sync.refreshNotices('manual');
    assert.equal(detailCalls, 1);
    const state = await repository.getSyncState();
    assert.equal(
      state.sources.find(({ sourceId }) => sourceId === 'seoultech_general')!
        .lastSuccessAt,
      null,
    );
    assert.ok(
      state.sources.find(({ sourceId }) => sourceId === 'seoultech_cs')!
        .lastSuccessAt,
    );
    assert.equal(
      (await repository.getNoticeDetail(normal.id))!.analysisFresh,
      true,
    );
  } finally {
    db.close();
  }
});

test('AI 큐는 동시 1건·자동 10건 제한, 수동 30초·자동 30분 재수집 제한을 지킨다', async () => {
  const { db, repository } = await openNodeNoticeRepository();
  try {
    const records = Array.from({ length: 12 }, (_, index) => ({
      ...normal,
      id: `seoultech_cs:58476:${100 + index}`,
      postId: String(100 + index),
    }));
    let time = new Date('2026-11-13T15:00:00Z');
    let active = 0,
      peak = 0,
      calls = 0,
      collections = 0;
    const collect = source(records);
    const sync = createNoticeSync({
      repository,
      randomUUID,
      now: () => time,
      collector: { sha256: nodeSha256 },
      keywords: () => ['AI'],
      collectSource: async (...args) => {
        collections++;
        return collect(...args);
      },
      analyze: async (request) => {
        calls++;
        peak = Math.max(peak, ++active);
        await Promise.resolve();
        active--;
        return {
          ...normalNoticeFixture.analysis,
          notice_id: request.notice_id,
        };
      },
    });
    await sync.refreshNotices('manual');
    assert.equal(calls, 10);
    assert.equal(peak, 1);
    await sync.refreshNotices('manual');
    assert.equal(collections, 2);
    time = new Date(time.getTime() + 31_000);
    await sync.refreshNotices('foreground');
    assert.equal(collections, 2);
    await sync.refreshNotices('manual');
    assert.equal(calls, 12);
    time = new Date(time.getTime() + 30 * 60_000);
    await sync.refreshNotices('foreground');
    assert.equal(collections, 6);
  } finally {
    db.close();
  }
});

test('429는 큐와 상세 재시도를 중지하고 대기 시각을 재실행 후에도 유지한다', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'team15-sync-'));
  const file = join(directory, 'notices.db');
  let { db, repository } = await openNodeNoticeRepository(file);
  let time = new Date('2026-11-13T15:00:00Z');
  let calls = 0;
  const make = () =>
    createNoticeSync({
      repository,
      randomUUID,
      now: () => time,
      collector: { sha256: nodeSha256 },
      analyze: async () => {
        calls++;
        throw new AnalysisClientError('RATE_LIMITED', 120);
      },
    });
  try {
    await repository.upsertRawNotice(normal);
    await repository.saveNotice(normal.id);
    let sync = make();
    await sync.analyzeNotice(normal.id);
    db.close();
    ({ db, repository } = await openNodeNoticeRepository(file));
    sync = make();
    await sync.analyzeNotice(normal.id);
    assert.equal(calls, 1);
    assert.equal(
      (await repository.getNoticeDetail(normal.id))!.disposition,
      'saved',
    );
    time = new Date(time.getTime() + 120_001);
    await sync.analyzeNotice(normal.id);
    assert.equal(calls, 2);
  } finally {
    db.close();
    rmSync(directory, { recursive: true });
  }
});

test('v1 migration과 재실행 복구는 저장 기록을 보존하고 running을 pending으로 되돌린다', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'team15-migrate-'));
  const file = join(directory, 'notices.db');
  const old = new DatabaseSync(file);
  old.exec(migration1);
  old.exec('PRAGMA user_version = 1');
  old
    .prepare(
      `INSERT INTO notices (id, source_id, board_id, post_id, source_url, title,
    raw_json, content_hash, fetched_at, analysis_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
    )
    .run(
      normal.id,
      normal.sourceId,
      normal.boardId,
      normal.postId,
      normal.sourceUrl,
      normal.title,
      JSON.stringify({
        bodyText: normal.bodyText,
        extractedLinks: normal.extractedLinks,
        attachments: normal.attachments,
        hasBodyImages: normal.hasBodyImages,
        sourceUpdatedAt: normal.sourceUpdatedAt,
      }),
      normal.contentHash,
      normal.fetchedAt,
    );
  old
    .prepare(
      `INSERT INTO user_notices (notice_id, disposition, progress, saved_at, updated_at, checklist_initialized)
    VALUES (?, 'saved', 'preparing', ?, ?, 1)`,
    )
    .run(normal.id, normal.fetchedAt, normal.fetchedAt);
  old
    .prepare(
      `INSERT INTO checklist_items (id, notice_id, text, evidence, completed, created_at)
    VALUES ('existing-check', ?, '기존 준비물', '기존 근거', 1, ?)`,
    )
    .run(normal.id, normal.fetchedAt);
  old.close();
  const { db, repository } = await openNodeNoticeRepository(file);
  try {
    await repository.recoverInterruptedAnalysis();
    assert.equal(
      (await repository.getNoticeDetail(normal.id))!.analysisStatus,
      'pending',
    );
    assert.equal(
      (await repository.getNoticeDetail(normal.id))!.disposition,
      'saved',
    );
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, 3);
    assert.equal(
      (await repository.getNoticeDetail(normal.id))!.progress,
      'preparing',
    );
    assert.deepEqual((await repository.getChecklist(normal.id)).items[0], {
      id: 'existing-check',
      text: '기존 준비물',
      evidence: '기존 근거',
      completed: true,
    });
  } finally {
    db.close();
    rmSync(directory, { recursive: true });
  }
});
