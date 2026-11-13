import {
  dateSchema,
  type AnalyzeNoticeRequest,
  type ExtractedEvent,
} from '../../shared/contracts';

// 연도만 있는 공통 머리글은 근거가 머리글부터 이어질 때에만 인정한다.
export function explicitDates(evidence: string): string[] {
  const direct = fullDates(evidence);
  const heading =
    /^(\d{4})\s*년(?:도)?\s*(?:일정|모집\s*일정|신청\s*기간|접수\s*기간)\s*[:：|\n]\s*([^\d]{0,40})(\d{1,2}\s*(?:월|[./-])[\s\S]*)$/.exec(
      evidence,
    );
  if (!heading || /\d{4}/.test(heading[3]!)) return direct;
  return [...direct, ...fullDates(`${heading[1]}. ${heading[3]}`)];
}

function contextYears(text: string): number[] {
  return [
    ...new Set(
      [
        ...text.matchAll(/(?<!\d)(\d{4})\s*(?:년|[./-]\s*\d{1,2}\s*[./-])/g),
      ].map((match) => Number(match[1])),
    ),
  ];
}

// 추정은 순수 함수로 수행한다. 현재 시각이나 모델이 만든 날짜를 근거로 삼지 않는다.
export function inferEventDate(
  input: AnalyzeNoticeRequest,
  event: ExtractedEvent,
): { date: string; reason: string } | null {
  const evidence = event.evidence;
  // 명시 연도가 있는 날짜의 불일치/미지원 표기는 추정으로 덮지 않는다.
  if (/\d{4}/.test(evidence)) return null;
  const matches = [
    ...evidence.matchAll(
      /(?<![\d./-])(\d{1,2})\s*(?:월\s*|[./-]\s*)(\d{1,2})(?:\s*일)?(?!\d)/g,
    ),
  ];
  if (!matches.length || matches.length > 2) return null;
  const first = matches[0]!;
  const firstEnd = first.index! + first[0].length;
  const shortEnd =
    /^\s*\.?\s*(?:\([^\n)]{1,10}\)\s*)?(?:~|～|–|—|부터)\s*(\d{1,2})(?:\s*일)?(?![\d./월-])/.exec(
      evidence.slice(firstEnd),
    );
  const dates = matches.map((match) => ({
    month: Number(match[1]),
    day: Number(match[2]),
    end: match.index! + match[0].length,
  }));
  if (dates.length === 1 && shortEnd)
    dates.push({
      month: dates[0]!.month,
      day: Number(shortEnd[1]),
      end: firstEnd + shortEnd[0].length,
    });
  let selected = dates[0]!;
  if (dates.length === 2) {
    if (
      matches.length === 2 &&
      !/~|～|–|—|부터/.test(evidence.slice(firstEnd, matches[1]!.index))
    )
      return null;
    const end = dates[1]!;
    // 연도 경계가 생략된 범위는 원문으로 남긴다.
    if (end.month * 100 + end.day < selected.month * 100 + selected.day)
      return null;
    if (
      ['application_close', 'document_deadline', 'event_end'].includes(
        event.type,
      )
    )
      selected = end;
    else if (!['application_open', 'event_start'].includes(event.type))
      return null;
  }
  const makeDate = (year: number) =>
    `${year}-${String(selected.month).padStart(2, '0')}-${String(selected.day).padStart(2, '0')}`;
  const titleYears = contextYears(input.title);
  const bodyYears = contextYears(input.body_text);
  const years = [...new Set([...titleYears, ...bodyYears])];
  let date: string;
  let reason: string;
  if (years.length > 1) return null;
  if (years.length === 1) {
    date = makeDate(years[0]!);
    reason = `${titleYears.length ? '제목' : '본문의 다른 구절'}의 ${years[0]}년을 바탕으로 연도를 추정했습니다.`;
  } else if (input.published_date) {
    const published = Date.parse(input.published_date);
    const year = Number(input.published_date.slice(0, 4));
    const candidates = [year - 1, year, year + 1]
      .map(makeDate)
      .filter((value) => dateSchema.safeParse(value).success)
      .map((value) => ({
        date: value,
        distance: Math.abs(Date.parse(value) - published),
      }))
      .filter(({ distance }) => distance <= 183 * 86400000)
      .sort((a, b) => a.distance - b.distance);
    if (
      !candidates.length ||
      candidates[0]!.distance === candidates[1]?.distance
    )
      return null;
    date = candidates[0]!.date;
    reason = `게시일 ${input.published_date}에 가까운 날짜로 연도를 추정했습니다.`;
  } else return null;
  if (!dateSchema.safeParse(date).success) return null;
  const weekday = /^\s*\.?\s*\(([일월화수목금토])(?:요일)?\)/.exec(
    evidence.slice(selected.end),
  );
  if (weekday && '일월화수목금토'[new Date(date).getUTCDay()] !== weekday[1])
    return null;
  return { date, reason };
}

export function fullDates(evidence: string): string[] {
  const dates: string[] = [];
  for (const match of evidence.matchAll(
    /(?<!\d)(\d{4})\s*(?:년\s*|[./-]\s*)(\d{1,2})\s*(?:월\s*|[./-]\s*)(\d{1,2})(?:\s*일)?(?!\d)/g,
  )) {
    const start = `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
    dates.push(start);
    // 같은 연속 날짜 범위의 생략된 연·월만 연결한다. 다른 문장이나 연도 경계는 추측하지 않는다.
    const tail = evidence.slice(match.index! + match[0].length);
    const end =
      /^\s*\.?\s*(?:\([^\)\n]{1,10}\)\s*)?(?:~|～|–|—|부터)\s*(?:(\d{1,2})\s*(?:월\s*|[./-]\s*))?(\d{1,2})(?:\s*일)?(?!\d)/.exec(
        tail,
      );
    if (end) {
      const endDate = `${match[1]}-${(end[1] ?? match[2]!).padStart(2, '0')}-${end[2]!.padStart(2, '0')}`;
      if (endDate >= start) dates.push(endDate);
    }
  }
  return dates;
}
