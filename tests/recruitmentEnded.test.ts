import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalNoticeFixture,
  dateOnlyNoticeFixture,
} from '../fixtures/synthetic/notices';
import { recruitmentEnded } from '../src/domain/dates';

test('수정 제목의 종료 표시를 감지하고 마감 예고나 일정 제목은 유지한다', () => {
  const now = new Date('2026-11-14T00:00:00Z');
  assert.equal(
    recruitmentEnded('[기업탐방] 참가 모집 - 선착순 마감(종료)', [], now),
    true,
  );
  assert.equal(recruitmentEnded('참가 모집(마감)', [], now), true);
  assert.equal(recruitmentEnded('[접수종료] 참가 모집', [], now), true);
  assert.equal(recruitmentEnded('참가 모집 - 선착순 마감', [], now), false);
  assert.equal(recruitmentEnded('참가 모집 (신청 마감 11/20)', [], now), false);
  assert.equal(recruitmentEnded('교육 종료 일정 안내', [], now), false);
});

test('확정 신청 마감만 한국 시각으로 비교한다', () => {
  const timed = normalNoticeFixture.analysis.data.events;
  const dayOnly = dateOnlyNoticeFixture.analysis.data.events;
  assert.equal(
    recruitmentEnded('신청 안내', timed, new Date('2026-11-20T08:59:59Z')),
    false,
  );
  assert.equal(
    recruitmentEnded('신청 안내', timed, new Date('2026-11-20T09:00:00Z')),
    true,
  );
  assert.equal(
    recruitmentEnded('신청 안내', dayOnly, new Date('2026-11-20T14:59:59Z')),
    false,
  );
  assert.equal(
    recruitmentEnded('신청 안내', dayOnly, new Date('2026-11-20T15:00:00Z')),
    true,
  );
});
