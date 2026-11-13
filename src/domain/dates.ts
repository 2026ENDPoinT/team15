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

function pastEventDatesInBody(
  titleYears: string[],
  body: string,
  today: string,
): boolean {
  const lines = body
    .normalize('NFKC')
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line
        .trim()
        .match(
          /^(?:(?:\d+[.)]|[-•*])\s*)?(?:(?:행사|강연|프로그램|교육)\s*)?일시\s*:\s*(.*)$/,
        );
      return match?.[1] ? [match[1]] : [];
    });
  return (
    lines.length > 0 &&
    lines.every((line) => {
      const match = line.match(
        /^(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s*\(([일월화수목금토])(?:요일)?\))?(?:\s*(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[~∼–—-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?)?\s*$/,
      );
      if (!match) return false;
      const [, explicitYear, month, day, weekday] = match;
      const year =
        explicitYear ??
        (titleYears.length === 1 && weekday ? titleYears[0] : undefined);
      if (!year) return false;
      const date =
        year + '-' + month!.padStart(2, '0') + '-' + day!.padStart(2, '0');
      const parsed = new Date(date);
      return (
        Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === date &&
        (!weekday || '일월화수목금토'[parsed.getUTCDay()] === weekday) &&
        date < today
      );
    })
  );
}

export function eventNoticeEnded(
  title: string,
  body: string,
  events: ExtractedEvent[],
  now: Date,
): boolean {
  const today = new Date(now.getTime() + seoulOffsetMs)
    .toISOString()
    .slice(0, 10);
  const schedule = events.filter(
    ({ type }) => type === 'event_start' || type === 'event_end',
  );
  if (events.some(({ date }) => date && date >= today)) return false;
  const titleYears = [...new Set(title.match(/20\d{2}(?=\s*(?:학년도|년))/g))];
  if (pastEventDatesInBody(titleYears, body, today)) {
    // Received dates must agree that the program has passed.
    return schedule.every(({ date }) => !date || date < today);
  }
  if (!schedule.length) return false;
  const source = normalizeText(body);
  return schedule.every((event) => {
    if (!event.date || event.date >= today) return false;
    if (event.status === 'resolved') return true;
    const [year, month, day] = event.date.split('-');
    const evidence = normalizeText(event.evidence);
    if (!source.includes(evidence)) return false;
    const date = new RegExp(
      '(?:^|[^0-9])0?' +
        Number(month) +
        '\\s*월\\s*0?' +
        Number(day) +
        '\\s*일\\s*\\(([일월화수목금토])(?:요일)?\\)',
    );
    const match = evidence.match(date);
    return (
      titleYears.length === 1 &&
      titleYears[0] === year &&
      !!match &&
      match[1] === '일월화수목금토'[new Date(event.date).getUTCDay()]
    );
  });
}
