import type { ReminderRecord } from '../../db/noticeRepository';
import type { ExtractedEvent } from '../../../shared/contracts';
import { confirmedCardText } from './noticeCardPresentation';

export function detailEventLabel(event: ExtractedEvent): string {
  if (event.status === 'resolved')
    return `${event.label} · ${event.date}${event.time ? ` ${event.time}` : ''}`;
  const candidate = event.date
    ? ` · 후보 ${event.date}${event.time ? ` ${event.time}` : ''}`
    : '';
  return `${event.label} · ${event.evidence}${candidate} · 확인 필요`;
}
const attachmentNotes = new Set([
  '첨부파일 내용은 확인하지 못했으므로 원문과 첨부파일을 함께 참고하시기 바랍니다.',
  '첨부파일 내용은 분석하지 않았습니다. 원문에서 첨부를 확인하세요.',
  '첨부파일과 이미지 내용을 분석하지 않았습니다. 원문 확인이 필요합니다.',
]);
export function detailReviewNotes(notes: string[], hasAttachments: boolean) {
  const result = new Set<string>();
  let needsAttachmentNote = hasAttachments;
  for (const note of notes) {
    const text = note.trim().replace(/\s+/g, ' ');
    if (!text) continue;
    if (
      attachmentNotes.has(text) ||
      (/(첨부|이미지|포스터)/.test(text) &&
        /(분석하지 않|확인하지 못|읽지 않|포함되어 있지 않)/.test(text))
    )
      needsAttachmentNote = true;
    else result.add(text);
  }
  if (needsAttachmentNote)
    result.add(
      '첨부 파일 및 이미지 내용은 확인하지 못했으므로 원문에서 확인하시기 바랍니다.',
    );
  return [...result];
}
export function confirmedDetailReviewNotes(
  notes: string[],
  hasAttachments: boolean,
) {
  // Distinct source notes can become identical after uncertain sentences are removed.
  return [
    ...new Set(
      detailReviewNotes(notes, hasAttachments)
        .map(confirmedCardText)
        .filter(Boolean),
    ),
  ];
}
export type NotificationSnapshot = {
  status: 'available' | 'unsupported' | 'error';
  allowed: boolean;
  scheduled: { noticeId: string; fireAt: string }[];
};
export function deadlineReminderLabel(
  noticeId: string,
  snapshot: NotificationSnapshot,
  records: ReminderRecord[],
  now = Date.now(),
): string {
  if (snapshot.status === 'unsupported')
    return '마감 알림 · 이 환경에서는 지원하지 않아요.';
  if (snapshot.status === 'error')
    return '마감 알림 · 기기 예약을 확인하지 못했어요.';
  const record = records.find((item) => item.noticeId === noticeId);
  if (record?.state === 'error')
    return '마감 알림 · 예약 변경에 실패했어요. 다시 확인해 주세요.';
  if (record?.state === 'needs_sync')
    return '마감 알림 · 예약 상태를 동기화해야 해요.';
  if (!snapshot.allowed)
    return '마감 알림 · 기기 설정에서 알림을 허용해 주세요.';
  const scheduled = snapshot.scheduled.find(
    (item) => item.noticeId === noticeId && Date.parse(item.fireAt) > now,
  );
  if (scheduled) {
    const date = new Date(
      Date.parse(scheduled.fireAt) + 9 * 60 * 60 * 1000,
    ).toISOString();
    return (
      '마감 알림 · ' +
      date.slice(0, 10) +
      ' ' +
      date.slice(11, 16) +
      ' KST 예약됨'
    );
  }
  return '마감 알림 · 예약된 알림이 없어요.';
}
