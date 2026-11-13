import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detailReviewNotes,
  confirmedDetailReviewNotes,
  detailEventLabel,
  deadlineReminderLabel,
  type NotificationSnapshot,
} from '../src/features/demo/noticeDetailPresentation';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';

test('불확실 문장을 제거한 뒤 같은 안내가 남으면 한 번만 표시한다', () => {
  assert.deepEqual(
    confirmedDetailReviewNotes(
      [
        '신청서를 제출하세요. 날짜 확인 필요.',
        '신청서를 제출하세요. 원문 참고.',
        '신청서를 제출하세요.',
        '학생증을 지참하세요.',
        '시각 미상',
      ],
      true,
    ),
    ['신청서를 제출하세요.', '학생증을 지참하세요.'],
  );
  assert.deepEqual(confirmedDetailReviewNotes([], false), []);
});

test('미확정 일정의 원문 월·일·시각과 후보 날짜를 숨기지 않는다', () => {
  const event = {
    ...normalNoticeFixture.analysis.data.events[0]!,
    status: 'needs_review' as const,
    date: null,
    evidence: '신청: 11월 20일 오후 6시',
  };
  assert.match(detailEventLabel(event), /11월 20일 오후 6시.*확인 필요/);
  assert.match(
    detailEventLabel({ ...event, date: '2026-11-20' }),
    /후보 2026-11-20.*확인 필요/,
  );
  assert.equal(
    detailEventLabel(normalNoticeFixture.analysis.data.events[0]!),
    '신청 마감 · 2026-11-20 18:00',
  );
});

test('첨부 기본 안내만 합치고 날짜 및 구체적인 제출 조건은 유지한다', () => {
  const notes = detailReviewNotes(
    [
      '첨부파일 내용은 확인하지 못했으므로 원문과 첨부파일을 함께 참고하시기 바랍니다.',
      '첨부파일 내용은 분석하지 않았습니다. 원문에서 첨부를 확인하세요.',
      '첨부파일 및 이미지 내용은 본문에 포함되어 있지 않으므로 원문을 확인하시기 바랍니다.',
      '본문 이미지 내용은 분석하지 않았습니다. 원문에서 이미지를 확인하세요.',
      '연도가 없어 날짜 확인이 필요합니다.',
      '첨부파일의 신청서를 작성해 제출하세요.',
      '연도가 없어 날짜 확인이 필요합니다.',
    ],
    true,
  );
  assert.equal(notes.length, 3);
  assert.ok(
    notes.includes(
      '첨부 파일 및 이미지 내용은 확인하지 못했으므로 원문에서 확인하시기 바랍니다.',
    ),
  );
  assert.ok(notes.includes('첨부파일의 신청서를 작성해 제출하세요.'));
  assert.ok(notes.includes('연도가 없어 날짜 확인이 필요합니다.'));
  assert.deepEqual(detailReviewNotes([], false), []);
});
test('실제 미래 예약만 예약됨으로 표시하며 지난 예약과 권한 없음은 구분한다', () => {
  const now = Date.parse('2026-11-14T00:00:00Z');
  const snapshot: NotificationSnapshot = {
    status: 'available',
    allowed: true,
    scheduled: [{ noticeId: 'one', fireAt: '2026-11-15T00:00:00Z' }],
  };
  assert.match(
    deadlineReminderLabel('one', snapshot, [], now),
    /2026-11-15 09:00 KST 예약됨/,
  );
  assert.match(
    deadlineReminderLabel('other', snapshot, [], now),
    /예약된 알림이 없어요/,
  );
  assert.match(
    deadlineReminderLabel('one', snapshot, [], now + 86400000),
    /예약된 알림이 없어요/,
  );
  assert.match(
    deadlineReminderLabel('one', { ...snapshot, allowed: false }, [], now),
    /허용/,
  );
  assert.match(
    deadlineReminderLabel('one', { ...snapshot, status: 'error' }, [], now),
    /확인하지 못했어요/,
  );
  assert.match(
    deadlineReminderLabel(
      'one',
      snapshot,
      [
        {
          key: 'key',
          noticeId: 'one',
          desiredFireAt: null,
          appliedFireAt: null,
          identifier: null,
          state: 'error',
          error: 'cancel failed',
        },
      ],
      now,
    ),
    /예약 변경에 실패/,
  );
});
