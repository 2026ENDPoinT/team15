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

export function gatheringEnded(
  title: string,
  publishedDate: string | null,
  now: Date,
  body = '',
): boolean {
  const normalized = normalizeText(title).normalize('NFKC');
  if (!/^re\s*:/i.test(normalized) || !/집결/.test(normalized)) return false;
  const match = normalized.match(
    /(\d{1,2})\/(\d{1,2})\s*\([월화수목금토일]\)\s*(\d{1,2}):(\d{2})\s*까지/,
  );
  if (!match) return false;
  const [, month, day, hour, minute] = match;
  if (Number(hour) > 23 || Number(minute) > 59) return false;
  const explicitYears = new Set(
    [
      ...body
        .normalize('NFKC')
        .matchAll(
          /(?:^|\n)[ \t]*[-•*]?[ \t]*(?:행사\s*)?일시[ \t]*[:：][ \t]*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
        ),
    ]
      .filter(
        ([, , m, d]) =>
          Number(m) === Number(month) && Number(d) === Number(day),
      )
      .map(([, year]) => Number(year)),
  );
  if (explicitYears.size > 1) return false;
  const publishedYear = publishedDate
    ? Number(publishedDate.slice(0, 4))
    : null;
  const candidateYears = explicitYears.size
    ? [...explicitYears]
    : publishedYear === null
      ? []
      : [publishedYear, publishedYear + 1];
  for (const candidateYear of candidateYears) {
    const date =
      candidateYear +
      '-' +
      month!.padStart(2, '0') +
      '-' +
      day!.padStart(2, '0');
    const dayStamp = Date.parse(date);
    if (
      !Number.isFinite(dayStamp) ||
      new Date(dayStamp).toISOString().slice(0, 10) !== date
    )
      continue;
    if (!explicitYears.size && publishedDate) {
      const daysFromPublication =
        (dayStamp - Date.parse(publishedDate)) / dayMs;
      if (daysFromPublication < 0 || daysFromPublication > 90) continue;
    }
    const time = hour!.padStart(2, '0') + ':' + minute;
    return Date.parse(date + 'T' + time + ':00+09:00') <= now.getTime();
  }
  return false;
}

export function attendanceFollowUpEnded(
  title: string,
  events: ExtractedEvent[],
  now: Date,
  body = '',
): boolean {
  const normalized = normalizeText(title).normalize('NFKC');
  if (!/^re\s*:/i.test(normalized) || !/출석\s*인정/.test(normalized))
    return false;
  const resolved = events.filter((event) => event.status === 'resolved');
  const today = new Date(now.getTime() + seoulOffsetMs)
    .toISOString()
    .slice(0, 10);
  // Keep the notice if a future date still needs confirmation.
  if (
    events.some(
      (event) =>
        event.status === 'needs_review' && event.date && event.date >= today,
    )
  )
    return false;
  if (
    !resolved.every((event) =>
      event.type === 'event_start'
        ? event.date < today
        : describeDate(event, now).ended,
    )
  )
    return false;
  if (
    resolved.some(({ type }) => type === 'event_start' || type === 'event_end')
  )
    return true;

  const source = body.normalize('NFKC');
  const datedLines = [
    ...source.matchAll(
      /(?:^|\n)[ \t]*[-•*]?[ \t]*(?:행사\s*|프로그램\s*)?일시[ \t]*[:：][ \t]*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
    ),
  ];
  const dates = datedLines.map(
    ([, year, month, day]) =>
      year + '-' + month!.padStart(2, '0') + '-' + day!.padStart(2, '0'),
  );
  return (
    dates.length > 0 &&
    dates.every((date) => {
      const stamp = Date.parse(date);
      return (
        Number.isFinite(stamp) &&
        new Date(stamp).toISOString().slice(0, 10) === date &&
        date < today
      );
    })
  );
}
