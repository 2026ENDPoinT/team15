import type {
  AnalyzeNoticeRequest,
  AnalysisEnvelope,
} from '../../shared/contracts';
import { normalNoticeFixture, changedNoticeFixture } from './notices';

// Authored fault-injection data. The board URLs are intercepted; these are never live captures.
export const t09NoticeId = 'seoultech_cs:58476:900000009';
export const t09Title = '[가상 T09] 변경·실패 검증 공지';
export type T09Stage = 'initial' | 'changed' | 'uncertain';
export type T09CollectionFault = 'none' | 'offline' | 'missing_body';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function t09Html(
  url: string,
  stage: T09Stage,
  fault: T09CollectionFault = 'none',
) {
  const parsed = new URL(url);
  if (fault === 'offline')
    return new Response('Injected offline failure', { status: 503 });
  let body: string;
  if (parsed.hostname.startsWith('www.')) {
    body =
      '<div class="wrap_list"><table class="tbl_list"><tr><td>등록된 게시물이 없습니다</td></tr></table></div>';
  } else if (!parsed.searchParams.has('do')) {
    body = `<div class="board_container"><table class="board"><tr class="body_tr"><td><a href="?do=view&bnum=58476&bidx=900000009">${t09Title}</a></td><td class="body_col_regdate">2026-11-13</td></tr></table></div>`;
  } else {
    const text =
      stage === 'uncertain'
        ? '신청 마감은 추후 안내합니다. 제출 서류는 참가 신청서입니다.'
        : (stage === 'initial' ? normalNoticeFixture : changedNoticeFixture)
            .notice.bodyText;
    body = `<div class="board_container"><div class="wrap_cont"><table class="tbl_list"><tr><th>제목</th><td>${t09Title}</td></tr><tr><th>날짜</th><td>2026-11-13</td></tr><tr><td class="${fault === 'missing_body' ? 'removed' : 'cont'}">${escapeHtml(text).replaceAll('\n', '<br>')}</td></tr></table></div></div>`;
  }
  return new Response(
    `${body}<form name="frmSearch"><input type="hidden" name="bnum" value="${parsed.hostname.startsWith('www.') ? '4691' : '58476'}"></form>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export function t09Envelope(
  request: AnalyzeNoticeRequest,
  stage: T09Stage,
): AnalysisEnvelope {
  const analysis = structuredClone(
    (stage === 'changed' ? changedNoticeFixture : normalNoticeFixture).analysis,
  );
  if (stage === 'uncertain') {
    analysis.data.events = [
      {
        type: 'application_close',
        label: '신청 마감',
        status: 'needs_review',
        date: null,
        time: null,
        timezone: null,
        precision: 'unknown',
        evidence: '신청 마감은 추후 안내합니다.',
      },
    ];
    analysis.data.review_notes = ['마감 날짜는 원문에서 다시 확인하세요.'];
  }
  return {
    ...analysis,
    notice_id: request.notice_id,
    content_hash: request.content_hash,
    analyzed_at: '2026-11-14T00:00:00Z',
  };
}

// Only authored T09 dates move. Live notice content is never edited for verification.
export function shiftT09Dates<T>(value: T, days: number): T {
  const json = JSON.stringify(value).replace(
    /2026년 11월 (20|23|25)일|2026-11-(20|23|25)/g,
    (match, koreanDay: string | undefined, isoDay: string | undefined) => {
      const day = Number(koreanDay ?? isoDay);
      const shifted = new Date(Date.parse(`2026-11-${day}`) + days * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const [year, month, date] = shifted.split('-');
      return match.includes('년')
        ? `${year}년 ${Number(month)}월 ${Number(date)}일`
        : shifted;
    },
  );
  return JSON.parse(json) as T;
}
