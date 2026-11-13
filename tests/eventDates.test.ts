import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';
import type { AnalyzeNoticeRequest, ExtractedEvent } from '../shared/contracts';
import { validateAnalysis } from '../worker/src/validate';
import { reminderFireAt } from '../src/domain/dates';
import { realNoticeInputs } from '../scripts/real_notice_inputs';
import verified from '../fixtures/real/worker/t05_verified.json';

function extract(
  evidence: string,
  patch: Partial<AnalyzeNoticeRequest> = {},
  eventPatch: Partial<ExtractedEvent> = {},
) {
  const input = {
    ...normalNoticeFixture.request,
    title: '프로그램 모집',
    body_text: evidence,
    published_date: null,
    ...patch,
  };
  return validateAnalysis(input, {
    ...normalNoticeFixture.analysis.data,
    events: [
      {
        type: 'application_close',
        label: '신청 마감',
        status: 'needs_review',
        date: null,
        time: null,
        timezone: 'Asia/Seoul',
        precision: 'unknown',
        evidence,
        ...eventPatch,
      },
    ],
  });
}

test('연도 생략 날짜는 제목·본문·게시일을 근거로 후보를 만들지만 자동 알림에는 쓰지 않는다', () => {
  for (const [patch, reason] of [
    [{ title: '2026년 프로그램 모집' }, '제목'],
    [
      { body_text: '행사: 2026.12.14.\n신청 마감: 11월 20일' },
      '본문의 다른 구절',
    ],
    [{ published_date: '2026-11-13' }, '게시일'],
  ] as const) {
    const result = extract('신청 마감: 11월 20일', patch);
    assert.equal(result.events[0]!.date, '2026-11-20');
    assert.equal(result.events[0]!.status, 'needs_review');
    assert.ok(result.review_notes.some((note) => note.includes(reason)));
    assert.equal(reminderFireAt(result.events, new Date('2026-11-13')), null);
  }
});

test('게시일 주변 연도 경계는 후보로만 보완하고 윤년·요일·연도 충돌을 검사한다', () => {
  assert.equal(
    extract('마감: 1.5.', { published_date: '2026-12-20' }).events[0]!.date,
    '2027-01-05',
  );
  assert.equal(
    extract('행사: 12.30.', { published_date: '2027-01-02' }).events[0]!.date,
    '2026-12-30',
  );
  assert.equal(
    extract('마감: 2월 29일', { title: '2024년 모집' }).events[0]!.date,
    '2024-02-29',
  );
  for (const [evidence, patch] of [
    ['마감: 2월 29일', { title: '2026년 모집' }],
    ['마감: 11월 20일(월)', { published_date: '2026-11-13' }],
    ['마감: 11월 20일', { title: '2026년과 2027년 모집' }],
    ['마감: 11월 20일', {}],
    ['마감: 13월 32일', { title: '2026년 모집' }],
    ['마감: 선착순', { published_date: '2026-11-13' }],
  ] as const)
    assert.equal(extract(evidence, patch).events[0]!.date, null, evidence);
});

test('연도 없는 범위의 시작·끝과 생략된 월을 구분하고 복수 후보는 추측하지 않는다', () => {
  for (const evidence of [
    '신청: 11.2.(월)~11.20.(금)',
    '신청: 11월 2일부터 20일까지',
  ]) {
    assert.equal(
      extract(evidence, { title: '2026년 모집' }, { type: 'application_open' })
        .events[0]!.date,
      '2026-11-02',
    );
    assert.equal(
      extract(evidence, { title: '2026년 모집' }).events[0]!.date,
      '2026-11-20',
    );
  }
  for (const evidence of [
    '마감: 11월 20일 또는 11월 21일',
    '일정: 12.31.~1.2.',
  ])
    assert.equal(
      extract(evidence, { title: '2026년 모집' }).events[0]!.date,
      null,
    );
});

test('같은 일정 머리글의 명시 연도는 확정 근거지만 다른 제목·금액은 확정 근거가 아니다', () => {
  const explicit = extract(
    '2026년 일정\n신청 마감: 11월 20일',
    {},
    { status: 'resolved', date: '2026-11-20', precision: 'date' },
  );
  assert.equal(explicit.events[0]!.status, 'resolved');
  for (const evidence of [
    '마감: 11월 20일',
    '참가비 2026원. 마감: 11월 20일',
  ]) {
    assert.equal(
      extract(
        evidence,
        { title: '2026년 모집' },
        { status: 'resolved', date: '2026-11-20', precision: 'date' },
      ).events[0]!.status,
      'needs_review',
    );
  }
});

test('실제 HTML과 e1 기록을 재검증하면 누락 연도 후보와 원문을 보존한다 (새 모델 호출 아님)', async () => {
  for (const input of await realNoticeInputs()) {
    const recorded = verified.results.find(
      ({ envelope }) => envelope.notice_id === input.notice_id,
    )!.envelope.data;
    const result = validateAnalysis(input, recorded);
    const pending = result.events.filter(
      (event) => event.status === 'needs_review',
    );
    assert.ok(pending.length > 0);
    assert.ok(pending.every((event) => event.date?.startsWith('2026-')));
    assert.ok(
      pending.every((event) => input.body_text.includes(event.evidence)),
    );
    assert.equal(reminderFireAt(result.events, new Date('2026-11-13')), null);
  }
});
