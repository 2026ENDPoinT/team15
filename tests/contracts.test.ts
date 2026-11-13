import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  analysisEnvelopeSchema,
  analyzeNoticeRequestSchema,
  collectedNoticeSchema,
  dateSchema,
  departmentScopeSchema,
  extractedEventSchema,
  noticeAnalysisSchema,
  MAX_BODY_CHARACTERS,
} from '../shared/contracts';
import { toAnalyzeNoticeRequest } from '../shared/mappers';
import {
  attachmentOnlyNoticeFixture,
  changedNoticeFixture,
  dateOnlyNoticeFixture,
  normalNoticeFixture,
  syntheticNoticeFixtures,
  unknownYearNoticeFixture,
} from '../fixtures/synthetic/notices';
import {
  invalidModelOutputFixture,
  rateLimitedFixture,
} from '../fixtures/synthetic/errors';

for (const fixture of syntheticNoticeFixtures) {
  test(`${fixture.key}: 수집→요청→응답의 식별자와 내용이 일치한다`, () => {
    assert.equal(collectedNoticeSchema.safeParse(fixture.notice).success, true);
    assert.deepEqual(toAnalyzeNoticeRequest(fixture.notice), fixture.request);
    assert.equal(
      analysisEnvelopeSchema.safeParse(fixture.analysis).success,
      true,
    );
    assert.equal(fixture.request.notice_id, fixture.analysis.notice_id);
    assert.equal(fixture.request.content_hash, fixture.analysis.content_hash);
    assert.equal(
      fixture.request.schema_version,
      fixture.analysis.schema_version,
    );
    assert.equal(
      fixture.request.extractor_version,
      fixture.analysis.extractor_version,
    );
    assert.match(fixture.notice.title, /^\[가상\]/);
    assert.equal(new URL(fixture.notice.sourceUrl).hostname, 'example.invalid');

    // 샘플의 근거 누락을 방지한다. Worker의 의미 검증 구현을 대신하지 않는다.
    function checkEvidence(value: unknown): void {
      if (Array.isArray(value)) {
        value.forEach(checkEvidence);
      } else if (value !== null && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
          if (key === 'evidence' && typeof entry === 'string') {
            assert.ok(fixture.notice.bodyText.includes(entry), entry);
          } else {
            checkEvidence(entry);
          }
        }
      }
    }
    checkEvidence(fixture.analysis.data);
  });
}

test('제한 없음·특정 대상에는 근거가 필요하고 대상 배열 규칙을 지킨다', () => {
  for (const scope of [
    { mode: 'all', values: [], evidence: null },
    { mode: 'all', values: ['컴퓨터공학과'], evidence: '전 학과' },
    { mode: 'specific', values: [], evidence: '컴퓨터공학과' },
    { mode: 'specific', values: ['컴퓨터공학과'], evidence: '  ' },
    { mode: 'unknown', values: ['컴퓨터공학과'], evidence: null },
  ]) {
    assert.equal(departmentScopeSchema.safeParse(scope).success, false);
  }
  assert.equal(
    departmentScopeSchema.safeParse({
      mode: 'unknown',
      values: [],
      evidence: null,
    }).success,
    true,
  );
});

test('실재하지 않는 날짜와 비윤년의 2월 29일을 거절한다', () => {
  for (const date of [
    '2026-02-30',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '11-20',
  ]) {
    assert.equal(dateSchema.safeParse(date).success, false, date);
  }
  assert.equal(dateSchema.safeParse('2028-02-29').success, true);
});

test('확정 일정의 날짜·시각·시간대·정밀도 조합을 검증한다', () => {
  const event = normalNoticeFixture.analysis.data.events[0]!;
  for (const patch of [
    { date: null },
    { time: null },
    { time: '24:00' },
    { time: '18:60' },
    { timezone: null },
    { timezone: 'America/New_York' },
    { precision: 'unknown' },
    { precision: 'date' },
  ]) {
    assert.equal(
      extractedEventSchema.safeParse({ ...event, ...patch }).success,
      false,
    );
  }
  assert.equal(dateOnlyNoticeFixture.analysis.data.events[0]!.time, null);
});

test('연도 미확인·선착순·첨부 중심 공지에 확정 마감이나 준비물을 만들지 않는다', () => {
  const unknown = unknownYearNoticeFixture.analysis.data;
  assert.ok(
    unknown.events.every(
      (event) => event.status === 'needs_review' && event.date === null,
    ),
  );
  assert.ok(
    unknown.events.every((event) => event.type !== 'application_close'),
  );
  const attachment = attachmentOnlyNoticeFixture;
  assert.deepEqual(attachment.analysis.data.events, []);
  assert.deepEqual(attachment.analysis.data.checklist, []);
  assert.equal(attachment.notice.attachments[0]!.url, null);
  assert.ok(attachment.analysis.data.review_notes.length > 0);
});

test('입력 길이 초과를 잘라내지 않고 거절하며 수집 원문은 보존할 수 있다', () => {
  const request = normalNoticeFixture.request;
  assert.equal(
    analyzeNoticeRequestSchema.safeParse({
      ...request,
      body_text: '가'.repeat(MAX_BODY_CHARACTERS),
    }).success,
    true,
  );
  assert.equal(
    analyzeNoticeRequestSchema.safeParse({
      ...request,
      body_text: '가'.repeat(MAX_BODY_CHARACTERS + 1),
    }).success,
    false,
  );
  assert.equal(
    collectedNoticeSchema.safeParse({
      ...normalNoticeFixture.notice,
      bodyText: '가'.repeat(MAX_BODY_CHARACTERS + 1),
    }).success,
    true,
  );
  for (const field of ['extracted_links', 'attachments'] as const) {
    const item =
      field === 'extracted_links'
        ? { label: '신청', url: 'https://example.invalid/apply' }
        : { name: '안내.pdf', url: null };
    assert.equal(
      analyzeNoticeRequestSchema.safeParse({
        ...request,
        [field]: Array.from({ length: 31 }, () => item),
      }).success,
      false,
    );
  }
});

test('실행 스킴 URL·계약 불일치·잘못된 해시·불필요한 개인정보 필드를 거절한다', () => {
  const request = normalNoticeFixture.request;
  for (const patch of [
    { source_url: 'javascript:alert(1)' },
    { schema_version: '1.0' },
    { content_hash: 'placeholder' },
    { profile: { grade: 3 } },
    { extracted_links: [{ label: '신청', url: 'data:text/html,test' }] },
    { attachments: [{ name: '안내.pdf', url: 'javascript:downloadfile(1)' }] },
  ]) {
    assert.equal(
      analyzeNoticeRequestSchema.safeParse({ ...request, ...patch }).success,
      false,
    );
  }
  assert.equal(
    noticeAnalysisSchema.safeParse({
      ...normalNoticeFixture.analysis.data,
      application_url: 'javascript:alert(1)',
    }).success,
    false,
  );
  assert.equal(
    collectedNoticeSchema.safeParse({
      ...normalNoticeFixture.notice,
      id: 'wrong-id',
    }).success,
    false,
  );
});

test('수정 샘플은 같은 공지 ID를 유지하면서 본문·마감·준비물이 바뀐다', () => {
  assert.equal(normalNoticeFixture.notice.id, changedNoticeFixture.notice.id);
  assert.notEqual(
    normalNoticeFixture.notice.contentHash,
    changedNoticeFixture.notice.contentHash,
  );
  assert.notEqual(
    normalNoticeFixture.analysis.data.events[0]!.date,
    changedNoticeFixture.analysis.data.events[0]!.date,
  );
  assert.equal(changedNoticeFixture.analysis.data.checklist.length, 2);
});

test('오류 샘플의 재시도 대기와 HTTP 상태가 문서 계약에 맞는다', () => {
  assert.equal(rateLimitedFixture.httpStatus, 429);
  assert.equal(
    Number(rateLimitedFixture.headers['Retry-After']),
    rateLimitedFixture.body.error.retry_after_seconds,
  );
  assert.equal(invalidModelOutputFixture.httpStatus, 502);
  assert.equal(
    invalidModelOutputFixture.body.error.code,
    'INVALID_MODEL_OUTPUT',
  );
});

test('분석 스키마에서 JSON Schema를 생성할 수 있다', () => {
  const schema = z.toJSONSchema(noticeAnalysisSchema);
  assert.equal(schema.type, 'object');
  assert.ok(schema.properties?.events);
  // 선택한 AI 모델이 이 JSON Schema 전체를 지원하는지는 T05에서 별도 확인한다.
});
