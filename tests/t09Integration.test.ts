import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  t09Envelope,
  t09Html,
  t09NoticeId,
  shiftT09Dates,
  type T09Stage,
  type T09CollectionFault,
} from '../fixtures/synthetic/t09';
import {
  normalNoticeFixture,
  dateOnlyNoticeFixture,
  unknownYearNoticeFixture,
} from '../fixtures/synthetic/notices';
import {
  openNodeNoticeRepository,
  nodeSha256,
} from '../scripts/node_notice_repository';
import { createAnalysisClient } from '../src/services/analysisClient';
import { createNoticeSync } from '../src/services/noticeSync';
import { createNoticeActions } from '../src/services/noticeActions';
import {
  createReminderReconciler,
  type ReminderPlatform,
} from '../src/services/reminderReconciler';
import { describeDate, reminderFireAt } from '../src/domain/dates';
import { collectDetail } from '../src/sources/collector';
import verified from '../fixtures/real/t09/verified.json';
import {
  collectedNoticeSchema,
  analysisEnvelopeSchema,
} from '../shared/contracts';

function platformFake() {
  const scheduled = new Map<
    string,
    Awaited<ReturnType<ReminderPlatform['listScheduled']>>[number]
  >();
  const operations: string[] = [];
  let next = 0;
  const state = {
    allowed: true,
    cancelFails: false,
    scheduleFails: false,
    listFails: false,
  };
  const platform: ReminderPlatform = {
    async isAllowed() {
      return state.allowed;
    },
    async listScheduled() {
      if (state.listFails) throw new Error('injected list failure');
      return [...scheduled.values()];
    },
    async cancel(id) {
      operations.push(`cancel:${id}`);
      if (state.cancelFails) throw new Error('injected cancel failure');
      scheduled.delete(id);
    },
    async schedule(request) {
      operations.push(`schedule:${request.fireAt}`);
      if (state.scheduleFails) throw new Error('injected schedule failure');
      const identifier = `os-${++next}`;
      scheduled.set(identifier, { ...request, identifier });
      return identifier;
    },
  };
  return { platform, scheduled, operations, state };
}

test('T09 실제 정상 공지 캡처는 원본 해시·파싱·분석 계약·마감·준비물과 일치한다', async () => {
  const bytes = readFileSync('fixtures/real/t09/general_897698.html');
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    verified.raw_html_sha256,
  );
  const notice = collectedNoticeSchema.parse(verified.notice);
  const parsed = await collectDetail(notice, {
    sha256: nodeSha256,
    now: () => new Date(notice.fetchedAt),
    fetch: async () =>
      new Response(bytes.toString('utf8'), {
        headers: { 'Content-Type': 'text/html' },
      }),
  });
  assert.deepEqual(parsed, notice);
  const analysis = analysisEnvelopeSchema.parse(verified.envelope);
  assert.equal(analysis.content_hash, parsed.contentHash);
  for (const event of analysis.data.events)
    assert.ok(parsed.bodyText.includes(event.evidence));
  for (const item of analysis.data.checklist)
    assert.ok(parsed.bodyText.includes(item.evidence));
  assert.equal(
    reminderFireAt(analysis.data.events, new Date('2026-11-14T00:00:00Z')),
    verified.desired_fire_at,
  );
  assert.equal(
    analysis.data.events.find(({ type }) => type === 'application_close')!.time,
    null,
  );
});

test('T09 기기용 가상 날짜 이동은 월·연도를 넘겨도 원문과 분석을 함께 이동하고 해시를 보존한다', () => {
  const data = {
    dates: ['2026-11-20', '2026-11-23', '2026-11-25'],
    evidence: '2026년 11월 20일, 2026년 11월 23일, 2026년 11월 25일',
    content_hash: normalNoticeFixture.notice.contentHash,
  };
  assert.deepEqual(shiftT09Dates(data, 3), {
    ...data,
    dates: ['2026-11-23', '2026-11-26', '2026-11-28'],
    evidence: '2026년 11월 23일, 2026년 11월 26일, 2026년 11월 28일',
  });
  assert.deepEqual(shiftT09Dates(data, 45).dates, [
    '2027-01-04',
    '2027-01-07',
    '2027-01-09',
  ]);
});

async function setup(file = ':memory:') {
  const opened = await openNodeNoticeRepository(file);
  const os = platformFake();
  const state = {
    stage: 'initial' as T09Stage,
    fault: 'none' as T09CollectionFault,
    listed: true,
    aiStatus: 200,
    aiCalls: 0,
    time: new Date('2026-11-14T00:00:00Z'),
  };
  const clock = () => state.time;
  const reconcile = createReminderReconciler(
    opened.repository,
    os.platform,
    clock,
  );
  const actions = createNoticeActions(opened.repository, reconcile);
  const analyze = createAnalysisClient({
    getToken: async () => 'test-only-t09',
    fetch: async (_url, init) => {
      state.aiCalls++;
      if (state.aiStatus !== 200)
        return Response.json(
          {
            error: {
              code: 'PROVIDER_UNAVAILABLE',
              retryable: true,
              retry_after_seconds: null,
            },
            request_id: 'injected',
          },
          { status: state.aiStatus },
        );
      return Response.json(
        t09Envelope(JSON.parse(String(init?.body)), state.stage),
      );
    },
  });
  const sync = createNoticeSync({
    repository: opened.repository,
    randomUUID,
    now: clock,
    collector: {
      sha256: nodeSha256,
      fetch: async (url) => {
        const parsed = new URL(String(url));
        if (
          !state.listed &&
          parsed.hostname.startsWith('computer') &&
          !parsed.searchParams.has('do')
        )
          return new Response(
            '<div class="board_container"><table class="board"><tr><td>등록된 게시물이 없습니다</td></tr></table></div><form name="frmSearch"></form>',
            { headers: { 'Content-Type': 'text/html' } },
          );
        return t09Html(String(url), state.stage, state.fault);
      },
    },
    analyze,
    keywords: () => ['T09'],
    reconcileReminders: reconcile,
  });
  await sync.refreshNotices('manual');
  await actions.saveNotice(t09NoticeId);
  await actions.setProgress(t09NoticeId, 'preparing');
  const first = (await opened.repository.getChecklist(t09NoticeId)).items[0]!;
  await actions.setChecklistCompleted(first.id, true);
  await reconcile();
  async function refresh() {
    state.time = new Date(state.time.getTime() + 31_000);
    await sync.refreshNotices('manual');
  }
  return {
    ...opened,
    os,
    state,
    clock,
    reconcile,
    actions,
    sync,
    refresh,
    first,
  };
}

test('T09 실제 서비스 연결: HTML 변경 → AI 실패 → 이전 알림 취소 → 재분석 → 새 예약·변경 확인·캐시', async () => {
  const h = await setup();
  try {
    assert.equal(h.state.aiCalls, 1);
    assert.equal(
      [...h.os.scheduled.values()][0]!.fireAt,
      '2026-11-19T00:00:00.000Z',
    );
    h.state.stage = 'changed';
    h.state.aiStatus = 503;
    await h.refresh();
    const failed = (await h.repository.getNoticeDetail(t09NoticeId))!;
    assert.equal(failed.analysisStatus, 'failed');
    assert.equal(failed.analysisFresh, false);
    assert.ok(failed.analysis);
    assert.equal(h.os.scheduled.size, 0);
    assert.deepEqual((await h.repository.getHomeModel(h.clock())).schedule, []);
    assert.equal(failed.progress, 'preparing');
    assert.deepEqual((await h.repository.getChecklist(t09NoticeId)).items[0], {
      ...h.first,
      completed: true,
    });
    h.state.aiStatus = 200;
    await h.sync.analyzeNotice(t09NoticeId);
    const latest = (await h.repository.getNoticeDetail(t09NoticeId))!;
    assert.equal(latest.analysisFresh, true);
    assert.equal(latest.deadlineChanged, true);
    assert.equal(
      [...h.os.scheduled.values()][0]!.fireAt,
      '2026-11-22T00:00:00.000Z',
    );
    assert.deepEqual(h.os.operations, [
      'schedule:2026-11-19T00:00:00.000Z',
      'cancel:os-1',
      'schedule:2026-11-22T00:00:00.000Z',
    ]);
    const checklist = await h.repository.getChecklist(t09NoticeId);
    assert.equal(checklist.items[0]!.id, h.first.id);
    assert.equal(checklist.items[0]!.completed, true);
    assert.ok(
      checklist.updatedChecklist?.some(({ text }) => text !== h.first.text),
    );
    await h.refresh();
    assert.equal(h.state.aiCalls, 3);
    assert.equal(
      (await h.repository.getNoticeDetail(t09NoticeId))!.deadlineChanged,
      true,
    );
    await h.actions.acknowledgeDeadlineChange(t09NoticeId);
    assert.equal(
      (await h.repository.getNoticeDetail(t09NoticeId))!.deadlineChanged,
      false,
    );
  } finally {
    h.db.close();
  }
});

test('T09 목록 밖 저장 공지도 실제 상세 파서로 재수집하여 변경된 마감과 예약을 반영한다', async () => {
  const h = await setup();
  try {
    h.state.listed = false;
    h.state.stage = 'changed';
    await h.refresh();
    const detail = (await h.repository.getNoticeDetail(t09NoticeId))!;
    assert.equal(detail.analysisFresh, true);
    assert.equal(detail.deadlineChanged, true);
    assert.equal(h.state.aiCalls, 2);
    assert.equal(
      [...h.os.scheduled.values()][0]!.fireAt,
      '2026-11-22T00:00:00.000Z',
    );
    assert.ok(
      (await h.repository.getSyncState()).sources.every(
        ({ lastError }) => lastError === null,
      ),
    );
  } finally {
    h.db.close();
  }
});

for (const fault of ['offline', 'missing_body'] as const) {
  test(`T09 ${fault}: 원문·성공 시각·체크·이전 정상 알림을 유지하고 복구한다`, async () => {
    const h = await setup();
    try {
      const before = await h.repository.getNoticeDetail(t09NoticeId);
      const previousSync = await h.repository.getSyncState();
      const scheduled = [...h.os.scheduled.values()];
      h.state.fault = fault;
      await h.refresh();
      assert.deepEqual(await h.repository.getNoticeDetail(t09NoticeId), before);
      assert.deepEqual([...h.os.scheduled.values()], scheduled);
      const source = (await h.repository.getSyncState()).sources.find(
        ({ sourceId }) => sourceId === 'seoultech_cs',
      )!;
      assert.equal(
        source.lastSuccessAt,
        previousSync.sources.find(
          ({ sourceId }) => sourceId === source.sourceId,
        )!.lastSuccessAt,
      );
      assert.ok(source.lastError);
      assert.equal(h.state.aiCalls, 1);
      await h.actions.setChecklistCompleted(h.first.id, false);
      h.state.fault = 'none';
      await h.refresh();
      assert.equal(
        (await h.repository.getChecklist(t09NoticeId)).items[0]!.completed,
        false,
      );
      assert.equal(h.state.aiCalls, 1);
    } finally {
      h.db.close();
    }
  });
}

test('T09 확정 마감이 미확정으로 바뀌면 기존 예약을 취소하고 확인 필요 상태를 유지한다', async () => {
  const h = await setup();
  try {
    h.state.stage = 'uncertain';
    await h.refresh();
    assert.equal(h.os.scheduled.size, 0);
    assert.equal(
      (await h.repository.getNoticeDetail(t09NoticeId))!.deadlineChanged,
      true,
    );
    assert.deepEqual((await h.repository.getHomeModel()).schedule, []);
    assert.equal((await h.repository.listReminders())[0]!.desiredFireAt, null);
  } finally {
    h.db.close();
  }
});

test('T09 취소 실패 중 새 예약을 만들지 않고, 다음 재조정에서 취소 후 한 건만 예약한다', async () => {
  const h = await setup();
  try {
    h.os.state.cancelFails = true;
    h.state.stage = 'changed';
    await h.refresh();
    assert.equal(h.os.scheduled.size, 1);
    assert.equal(
      h.os.scheduled.get('os-1')!.fireAt,
      '2026-11-19T00:00:00.000Z',
    );
    assert.equal((await h.repository.listReminders())[0]!.state, 'error');
    assert.match(
      h.sync.getStatus().message ?? '',
      /알림 변경을 완료하지 못했어요/,
    );
    assert.equal(
      h.os.operations.filter((op) => op.startsWith('schedule')).length,
      1,
    );
    h.os.state.cancelFails = false;
    h.os.state.scheduleFails = true;
    await h.reconcile();
    assert.equal(h.os.scheduled.size, 0);
    assert.equal((await h.repository.listReminders())[0]!.identifier, null);
    assert.equal((await h.repository.listReminders())[0]!.state, 'error');
    h.os.state.scheduleFails = false;
    await Promise.all([h.reconcile(), h.reconcile()]);
    assert.equal(h.os.scheduled.size, 1);
    assert.equal((await h.repository.listReminders())[0]!.state, 'synced');
  } finally {
    h.db.close();
  }
});

test('T09 중복 OS 예약을 제거하고 목록 조회 실패 후에도 재조정 큐가 복구된다', async () => {
  const h = await setup();
  try {
    const existing = [...h.os.scheduled.values()][0]!;
    h.os.scheduled.set('duplicate', { ...existing, identifier: 'duplicate' });
    h.os.scheduled.set('outdated', {
      ...existing,
      identifier: 'outdated',
      fireAt: '2026-11-18T00:00:00Z',
    });
    h.os.state.listFails = true;
    await assert.rejects(h.reconcile(), /list failure/);
    h.os.state.listFails = false;
    await h.reconcile();
    assert.deepEqual([...h.os.scheduled.values()], [existing]);
  } finally {
    h.db.close();
  }
});

test('T09 권한 거절·반복 저장·신청 완료·관심 해제가 중복 없이 반영되고 행사 일정은 남는다', async () => {
  const h = await setup();
  try {
    await Promise.all(
      Array.from({ length: 8 }, () => h.actions.saveNotice(t09NoticeId)),
    );
    await h.reconcile();
    assert.equal(h.os.scheduled.size, 1);
    assert.equal(
      (await h.repository.getChecklist(t09NoticeId)).items.length,
      1,
    );
    h.os.state.allowed = false;
    await h.reconcile();
    assert.equal(h.os.scheduled.size, 0);
    assert.ok((await h.repository.getHomeModel()).schedule.length > 0);
    h.os.state.allowed = true;
    await h.reconcile();
    await h.actions.setProgress(t09NoticeId, 'applied');
    await h.reconcile();
    assert.equal(h.os.scheduled.size, 0);
    assert.ok(
      (await h.repository.getHomeModel()).schedule.some(
        ({ type }) => type === 'event_start',
      ),
    );
    await h.actions.setProgress(t09NoticeId, 'preparing');
    await h.reconcile();
    assert.equal(h.os.scheduled.size, 1);
    await h.actions.unsaveNotice(t09NoticeId);
    await h.reconcile();
    assert.equal(h.os.scheduled.size, 0);
  } finally {
    h.db.close();
  }
});

test('T09 OS 예약 뒤 DB 기록 전 종료: DB 재개방 시 기존 OS 식별자를 재사용한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'team15-t09-'));
  const file = join(dir, 'notice.db');
  const h = await setup(file);
  let db = h.db;
  try {
    await h.os.platform.cancel('os-1');
    const crashRepository = {
      ...h.repository,
      async persistReminder(
        record: Parameters<typeof h.repository.persistReminder>[0],
      ) {
        if (record.state === 'synced')
          throw new Error('injected termination before DB commit');
        await h.repository.persistReminder(record);
      },
    };
    await assert.rejects(
      createReminderReconciler(crashRepository, h.os.platform, h.clock)(),
      /termination/,
    );
    const scheduled = [...h.os.scheduled.values()];
    assert.equal(scheduled.length, 1);
    assert.equal((await h.repository.listReminders())[0]!.state, 'needs_sync');
    db.close();
    const reopened = await openNodeNoticeRepository(file);
    db = reopened.db;
    const reconcile = createReminderReconciler(
      reopened.repository,
      h.os.platform,
      h.clock,
    );
    await reconcile();
    assert.deepEqual([...h.os.scheduled.values()], scheduled);
    assert.equal(
      (await reopened.repository.listReminders())[0]!.identifier,
      scheduled[0]!.identifier,
    );
    assert.equal(
      (await reopened.repository.getChecklist(t09NoticeId)).items[0]!.completed,
      true,
    );
    await reopened.repository.setProgress(t09NoticeId, 'applied');
    await reconcile();
    db.close();
    const again = await openNodeNoticeRepository(file);
    db = again.db;
    await createReminderReconciler(again.repository, h.os.platform, h.clock)();
    assert.equal(h.os.scheduled.size, 0);
    assert.equal(
      (await again.repository.getNoticeDetail(t09NoticeId))!.progress,
      'applied',
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true });
  }
});

test('T09 DB에 없는 OS 예약은 취소하고 다른 공지 재조정을 계속한다', async () => {
  const h = await setup();
  try {
    const existing = [...h.os.scheduled.values()][0]!;
    h.os.scheduled.set('orphan', {
      ...existing,
      identifier: 'orphan',
      key: 'deleted:application_close:v1',
      noticeId: 'deleted',
    });
    await h.reconcile();
    assert.deepEqual([...h.os.scheduled.values()], [existing]);
  } finally {
    h.db.close();
  }
});

test('T09 체크리스트 순서 변경은 UUID·완료·변경 표시를 바꾸지 않는다', async () => {
  const { db, repository } = await openNodeNoticeRepository();
  try {
    const analysis = structuredClone(normalNoticeFixture.analysis);
    analysis.data.checklist.push({
      text: '추가 준비물',
      evidence: '가상 테스트 근거',
    });
    await repository.upsertRawNotice(normalNoticeFixture.notice);
    await repository.applyAnalysis(analysis);
    await repository.saveNotice(analysis.notice_id);
    const first = (await repository.getChecklist(analysis.notice_id)).items[0]!;
    await repository.setChecklistCompleted(first.id, true);
    const before = await repository.getChecklist(analysis.notice_id);
    analysis.data.checklist.reverse();
    await repository.applyAnalysis(analysis);
    assert.deepEqual(await repository.getChecklist(analysis.notice_id), before);
  } finally {
    db.close();
  }
});

test('T09 시간대·자정·D-1 경계에서 날짜와 예약 순간을 한국 기준으로 계산한다', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of [
      'Asia/Seoul',
      'America/Los_Angeles',
      'Pacific/Honolulu',
    ]) {
      process.env.TZ = timezone;
      const event = dateOnlyNoticeFixture.analysis.data.events[0]!;
      assert.equal(event.status, 'resolved');
      if (event.status !== 'resolved') throw new Error('fixture');
      assert.equal(event.time, null);
      assert.deepEqual(describeDate(event, new Date('2026-11-20T14:59:59Z')), {
        daysLeft: 0,
        ended: false,
      });
      assert.deepEqual(describeDate(event, new Date('2026-11-20T15:00:00Z')), {
        daysLeft: -1,
        ended: true,
      });
      assert.equal(
        reminderFireAt([event], new Date('2026-11-18T23:59:59Z')),
        '2026-11-19T00:00:00.000Z',
      );
      assert.equal(
        reminderFireAt([event], new Date('2026-11-19T00:00:00Z')),
        null,
      );
      assert.equal(
        reminderFireAt(
          [event, { ...event, date: '2026-11-21' }],
          new Date('2026-11-14T00:00:00Z'),
        ),
        null,
      );
      assert.equal(
        reminderFireAt(
          unknownYearNoticeFixture.analysis.data.events,
          new Date('2026-11-14T00:00:00Z'),
        ),
        null,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
