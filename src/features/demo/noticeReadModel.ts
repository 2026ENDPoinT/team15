import type { NoticeDetail, NoticeRecord } from '../../db/noticeRepository';
import { notices as samples, type Notice } from './campusNotices';
import { isLiveNotice } from '../../services/noticeSync';
import { detailEventLabel } from './noticeDetailPresentation';

export function isNoticeCardReady(record: NoticeRecord): boolean {
  // 고정 시연 카드는 수작업으로 작성한 완성 예시이며 AI 큐 대상이 아니다.
  return (
    !isLiveNotice(record.notice) ||
    (record.analysisFresh && record.analysisStatus === 'ready')
  );
}

export function getAnalysisProgress(records: NoticeRecord[]) {
  const progress = {
    total: 0,
    completed: 0,
    running: 0,
    waiting: 0,
    failed: 0,
    unsupported: 0,
  };
  for (const record of records) {
    if (!isLiveNotice(record.notice)) continue;
    progress.total++;
    if (isNoticeCardReady(record)) progress.completed++;
    else if (record.analysisStatus === 'running') progress.running++;
    else if (record.analysisStatus === 'failed') progress.failed++;
    else if (record.analysisStatus === 'unsupported') progress.unsupported++;
    else progress.waiting++;
  }
  return progress;
}

export function toNoticeCard(
  record: NoticeRecord,
  detail: NoticeDetail,
): Notice {
  if (!isLiveNotice(record.notice)) {
    const sample = samples.find(({ id }) => id === record.notice.id);
    if (sample) return { ...sample, synthetic: true };
  }
  const analysis = detail.analysis?.data;
  const deadline = detail.analysisFresh
    ? analysis?.events.find(
        (event) =>
          event.type === 'application_close' && event.status === 'resolved',
      )
    : null;
  const otherEvent = detail.analysisFresh
    ? analysis?.events.find((event) => event.status === 'resolved')
    : null;
  return {
    id: record.notice.id,
    sourceUrl: record.notice.sourceUrl,
    title: record.notice.title,
    org:
      record.notice.sourceId === 'seoultech_cs'
        ? '컴퓨터공학과 공지'
        : '서울과학기술대학교 공지',
    tags: analysis?.tags ?? [],
    date: deadline?.date ?? null,
    time: deadline?.time ?? null,
    scheduleText: otherEvent
      ? detailEventLabel(otherEvent).replace(' · ', ': ')
      : null,
    summary:
      analysis?.summary ??
      (record.notice.bodyText.slice(0, 180) ||
        '원문에서 내용을 확인해 주세요.'),
    synthetic: !isLiveNotice(record.notice),
    analysisLabel: detail.analysisFresh
      ? '분석 완료'
      : analysis
        ? '이전 분석 · 업데이트 확인 중'
        : detail.analysisStatus === 'running'
          ? '분석 중'
          : detail.analysisStatus === 'failed'
            ? '분석 실패 · 원문 확인'
            : detail.analysisStatus === 'unsupported'
              ? '자동 분석 미지원 · 원문 확인'
              : '미분석',
  };
}
