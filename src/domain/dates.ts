import { normalizeText } from '../../shared/canonicalize';
import type { ExtractedEvent } from '../../shared/contracts';

export type ResolvedEvent = Extract<ExtractedEvent, { status: 'resolved' }>;
const dayMs = 86_400_000;
const seoulOffsetMs = 9 * 60 * 60 * 1000;

export function deadlineSignature(events: ExtractedEvent[]): string {
  const deadlines = events
    .filter(
      ({ type }) =>
        type === 'application_close' || type === 'document_deadline',
    )
    .map(({ type, label, status, date, time, timezone, precision }) =>
      JSON.stringify([
        type,
        normalizeText(label).replace(/\s+/g, ''),
        status,
        date,
        time,
        timezone,
        precision,
      ]),
    );
  return JSON.stringify([...new Set(deadlines)].sort());
}

export function describeDate(event: ResolvedEvent, now: Date) {
  // The shared contract currently resolves dates only in Asia/Seoul.
  const today = new Date(now.getTime() + seoulOffsetMs)
    .toISOString()
    .slice(0, 10);
  const daysLeft = (Date.parse(event.date) - Date.parse(today)) / dayMs;
  const ended =
    event.time === null
      ? daysLeft < 0
      : Date.parse(`${event.date}T${event.time}:00+09:00`) <= now.getTime();
  return { daysLeft, ended };
}

export function reminderFireAt(
  events: ExtractedEvent[],
  now: Date,
): string | null {
  const deadlines = events.filter(({ type }) => type === 'application_close');
  const deadline = deadlines[0];
  if (deadlines.length !== 1 || deadline?.status !== 'resolved') return null;
  // Midnight UTC is 09:00 KST.
  const fireAt = Date.parse(deadline.date) - dayMs;
  return fireAt > now.getTime() ? new Date(fireAt).toISOString() : null;
}

export function recruitmentEnded(
  title: string,
  events: ExtractedEvent[],
  now: Date,
): boolean {
  const normalized = normalizeText(title).normalize('NFKC');
  // A standalone status or an explicit recruitment label, not a mention of a
  // program's end date or a future deadline.
  if (
    /[(\[]\s*(?:(?:신청|접수|모집)\s*)?(?:마감|종료)(?:\s*완료)?\s*[)\]]\s*$/.test(
      normalized,
    ) ||
    /^(?:\[|\()\s*(?:(?:신청|접수|모집)\s*)?(?:마감|종료)(?:\s*완료)?\s*(?:\]|\))/.test(
      normalized,
    ) ||
    /(?:^|\s|[-–—])(?:모집|신청|접수)\s*(?:마감|종료)(?:\s*완료)?[.!]?\s*$/.test(
      normalized,
    ) ||
    /[-–—]\s*(?:마감|종료)[.!]?\s*$/.test(normalized)
  )
    return true;

  const deadlines = events.filter(
    (event) => event.type === 'application_close',
  );
  return (
    deadlines.length > 0 &&
    deadlines.every(
      (event) => event.status === 'resolved' && describeDate(event, now).ended,
    )
  );
}
