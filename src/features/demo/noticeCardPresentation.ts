import type { Notice } from './campusNotices';

// Hide the whole uncertain statement, so removing a qualifier never makes it
// look like a confirmed fact. Keep the original analysis and source untouched.
const uncertain =
  /확인\s*(?:이\s*)?필요|원문.{0,30}(?:확인|참고)|미확인|미정|불확실|추정|확정되지|확인되지|확인하지\s*못|추후\s*(?:안내|공지)|별도\s*(?:안내|공지)|시각\s*미상|날짜\s*미상/;

export function confirmedCardText(text?: string | null): string {
  if (!text) return '';
  return text
    .split(/(?<=[.!?。])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !uncertain.test(sentence))
    .join(' ');
}

export function noticeCardMetadata(notice: Notice, eligibilityLabel: string) {
  const schedule = notice.date
    ? `${notice.date}${notice.time ? ` · ${notice.time} KST` : ''} 마감`
    : confirmedCardText(notice.scheduleText);
  return [confirmedCardText(eligibilityLabel), schedule]
    .filter(Boolean)
    .join(' · ');
}
