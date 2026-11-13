import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalNoticeFixture,
  dateOnlyNoticeFixture,
} from '../fixtures/synthetic/notices';
import {
  attendanceFollowUpEnded,
  gatheringEnded,
  recruitmentEnded,
} from '../src/domain/dates';

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

test('연도가 없는 집결 안내는 게시일이 뒷받침하는 경우에만 지난 안내로 본다', () => {
  const title =
    'Re : [기업탐방] DB Inc. 집결 장소 및 시간 안내(~9/17(목) 12:40까지)';
  assert.equal(
    gatheringEnded(title, '2026-09-15', new Date('2026-09-17T03:39:59Z')),
    false,
  );
  assert.equal(
    gatheringEnded(title, '2026-09-15', new Date('2026-11-14T00:00:00Z')),
    true,
  );
  assert.equal(
    gatheringEnded(title, null, new Date('2026-11-14T00:00:00Z')),
    false,
  );
});

test('집결 제목의 월일과 본문 일시가 일치하면 게시일 없이도 제외한다', () => {
  const title =
    'Re : [기업탐방] DB Inc. 집결 장소 및 시간 안내(~9/17(목) 12:40까지)';
  const body = '프로그램 안내\n- 일시: 2026년 9월 17일(목) 14:00 ~ 15:30';
  const now = new Date('2026-11-14T00:00:00Z');
  assert.equal(gatheringEnded(title, null, now, body), true);
  assert.equal(
    gatheringEnded(title, null, now, body.replace('17일', '18일')),
    false,
  );
  assert.equal(
    gatheringEnded(title, null, now, body + '\n- 일시: 2027년 9월 17일'),
    false,
  );
});

test('지난 출석인정 후속 공지만 제외하며 남은 확정 기한은 유지한다', () => {
  const title = 'Re : [기업탐방] 출석인정 관련 사항 안내';
  const events = normalNoticeFixture.analysis.data.events;
  assert.equal(
    attendanceFollowUpEnded(
      title,
      events,
      new Date('2026-11-25T11:00:00+09:00'),
    ),
    false,
  );
  assert.equal(
    attendanceFollowUpEnded(
      title,
      events,
      new Date('2026-11-26T00:00:00+09:00'),
    ),
    true,
  );
  assert.equal(
    attendanceFollowUpEnded(title, [], new Date('2026-11-26T00:00:00+09:00')),
    false,
  );
  const futureDeadline = {
    ...events[0]!,
    type: 'document_deadline' as const,
    date: '2026-11-30',
  };
  assert.equal(
    attendanceFollowUpEnded(
      title,
      [...events, futureDeadline],
      new Date('2026-11-26T00:00:00+09:00'),
    ),
    false,
  );
});

test('출석인정 후속글은 AI가 행사 유형을 확정하지 않아도 원문의 지난 일시로 제외한다', () => {
  const title = 'Re : [기업탐방] 출석인정 관련 사항 안내';
  const body = '프로그램 안내\n- 일시: 2026년 9월 17일(목) 14:00 ~ 15:30';
  const now = new Date('2026-11-14T00:00:00Z');
  assert.equal(attendanceFollowUpEnded(title, [], now, body), true);
  assert.equal(
    attendanceFollowUpEnded(
      title,
      [],
      now,
      body + '\n- 일시: 2026년 11월 30일',
    ),
    false,
  );
});
