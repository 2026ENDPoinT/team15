import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmedCardText,
  noticeCardMetadata,
} from '../src/features/demo/noticeCardPresentation';
import { notices } from '../src/features/demo/campusNotices';

test('불확실한 문장을 통째로 숨기고 확정 문장의 내용은 유지한다', () => {
  assert.equal(
    confirmedCardText(
      '참가비는 무료입니다. 장소는 확인 필요합니다. 일정은 원문에서 확인하세요.',
    ),
    '참가비는 무료입니다.',
  );
  assert.equal(
    confirmedCardText('신청일은 2026.11.20. 18:00입니다.'),
    '신청일은 2026.11.20. 18:00입니다.',
  );
  assert.equal(
    confirmedCardText('신청서를 확인하세요.'),
    '신청서를 확인하세요.',
  );
  for (const text of [
    '일정 미정',
    '장소 미확인',
    '추후 안내합니다.',
    '날짜는 추정입니다.',
  ]) {
    assert.equal(confirmedCardText(text), '');
  }
});

test('날짜가 확정되고 시각이 없으면 날짜만 표시한다', () => {
  assert.equal(
    noticeCardMetadata({ ...notices[0]!, time: null }, '지원 조건 확인 필요'),
    '2026-11-20 마감',
  );
});

test('미확정 일정과 지원 조건을 숨길 때 빈 구분점이나 대체 문구를 만들지 않는다', () => {
  const notice = {
    ...notices[0]!,
    date: null,
    time: null,
    scheduleText: '프로그램 일시 · 후보 2026-11-20 · 확인 필요',
  };
  assert.equal(noticeCardMetadata(notice, '지원 조건 확인 필요'), '');
  assert.equal(
    noticeCardMetadata(notice, '지원 조건 불일치'),
    '지원 조건 불일치',
  );
  assert.equal(
    noticeCardMetadata(
      { ...notice, scheduleText: '설명회: 2026-11-20' },
      '기본 조건 일치',
    ),
    '기본 조건 일치 · 설명회: 2026-11-20',
  );
});
