import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';
import type { NoticeRecord } from '../src/db/noticeRepository';
import {
  getAnalysisProgress,
  isNoticeCardReady,
} from '../src/features/demo/noticeReadModel';

const record: NoticeRecord = {
  notice: {
    ...normalNoticeFixture.notice,
    sourceUrl: 'https://computer.seoultech.ac.kr/info/notice',
  },
  disposition: 'unseen',
  progress: null,
  analysisStatus: 'pending',
  lastError: null,
  analysisFresh: false,
};

test('최신 분석이 완료된 실제 공지만 표시하고 대기·진행·실패·미지원·구버전 카드는 숨긴다', () => {
  for (const analysisStatus of [
    'pending',
    'running',
    'failed',
    'unsupported',
    'ready',
  ] as const) {
    assert.equal(isNoticeCardReady({ ...record, analysisStatus }), false);
  }
  assert.equal(
    isNoticeCardReady({
      ...record,
      analysisStatus: 'ready',
      analysisFresh: true,
    }),
    true,
  );
  assert.equal(
    isNoticeCardReady({
      ...record,
      disposition: 'saved',
      analysisStatus: 'failed',
    }),
    false,
  );
});

test('진행 건수는 실제 공지 전체를 빠짐없이 나누고 과거 성공은 대기, 실패는 미완료로 센다', () => {
  const records: NoticeRecord[] = [
    { ...record, analysisStatus: 'ready', analysisFresh: true },
    { ...record, analysisStatus: 'ready' },
    { ...record, analysisStatus: 'pending' },
    { ...record, analysisStatus: 'running' },
    { ...record, analysisStatus: 'failed' },
    { ...record, analysisStatus: 'unsupported' },
    { ...record, notice: normalNoticeFixture.notice },
  ];
  assert.deepEqual(getAnalysisProgress(records), {
    total: 6,
    completed: 1,
    waiting: 2,
    running: 1,
    failed: 1,
    unsupported: 1,
  });
  assert.deepEqual(getAnalysisProgress([]), {
    total: 0,
    completed: 0,
    waiting: 0,
    running: 0,
    failed: 0,
    unsupported: 0,
  });
});
