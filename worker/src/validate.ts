import { normalizeText } from '../../shared/canonicalize';
import {
  noticeAnalysisSchema,
  type AnalyzeNoticeRequest,
  type EventType,
  type ExtractedEvent,
  type NoticeAnalysis,
} from '../../shared/contracts';
import { ApiFailure } from './http';

const scopeLabels = {
  departments: '학과',
  grades: '학년',
  enrollments: '학적',
};
const unrestrictedEvidence = {
  departments:
    /전\s*학과|모든\s*학과|(?:학과|전공|소속)\s*(?:에\s*)?(?:관계\s*없|상관\s*없|제한\s*없|무관)/,
  grades:
    /전\s*학년|모든\s*학년|학년\s*(?:에\s*)?(?:관계\s*없|상관\s*없|제한\s*없|무관)/,
  enrollments:
    /(?:학적|재학\s*여부)\s*(?:에\s*)?(?:관계\s*없|상관\s*없|제한\s*없|무관)/,
};
const eventLabels: Record<EventType, string> = {
  application_open: '신청 시작',
  application_close: '신청 마감',
  document_deadline: '서류 제출 마감',
  event_start: '활동 시작',
  event_end: '활동 종료',
  result_announcement: '결과 발표',
};

function fullDates(evidence: string): string[] {
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

function hasTime(evidence: string, time: string): boolean {
  for (const match of evidence.matchAll(
    /(?<!\d)(오전|오후)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시(?:\s*(\d{1,2})\s*분)?)(?!\d)/g,
  )) {
    let hour = Number(match[2]);
    if (match[1] === '오후' && hour < 12) hour += 12;
    if (match[1] === '오전' && hour === 12) hour = 0;
    const minute = Number(match[3] ?? match[4] ?? 0);
    if (
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` ===
      time
    )
      return true;
  }
  return false;
}

function asReview(event: ExtractedEvent): ExtractedEvent {
  return { ...event, status: 'needs_review' };
}

function inputUrls(input: AnalyzeNoticeRequest): Set<string> {
  const urls = input.extracted_links.map((link) => link.url);
  for (const match of input.body_text.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    urls.push(match[0].replace(/[),.;!?\]}]+$/, ''));
  }
  return new Set(
    urls.flatMap((url) => {
      try {
        return [new URL(url).href];
      } catch {
        return [];
      }
    }),
  );
}

// 스키마 적합성 다음에 수행하는 최소 원문 대조. 의미 정확성은 실제 모델 표본 검토도 필요하다.
export function validateAnalysis(
  input: AnalyzeNoticeRequest,
  output: unknown,
): NoticeAnalysis {
  const parsed = noticeAnalysisSchema.safeParse(output);
  if (!parsed.success) throw new ApiFailure('INVALID_MODEL_OUTPUT');
  const data = parsed.data;
  const sources = [normalizeText(input.title), normalizeText(input.body_text)];
  const exists = (evidence: string | null) =>
    evidence !== null &&
    normalizeText(evidence).length > 0 &&
    sources.some((source) => source.includes(normalizeText(evidence)));
  const note = (message: string) => {
    data.review_notes.push(message);
  };

  for (const key of ['departments', 'grades', 'enrollments'] as const) {
    const scope = data.eligibility[key];
    if (
      (scope.mode !== 'unknown' || scope.evidence !== null) &&
      !exists(scope.evidence)
    ) {
      data.eligibility[key] = { mode: 'unknown', values: [], evidence: null };
      note(
        `${scopeLabels[key]}: 대상 조건의 근거를 원문에서 확인할 수 없습니다.`,
      );
    } else if (
      scope.mode === 'all' &&
      !unrestrictedEvidence[key].test(normalizeText(scope.evidence))
    ) {
      data.eligibility[key] = {
        mode: 'unknown',
        values: [],
        evidence: scope.evidence,
      };
      note(
        `${scopeLabels[key]} 제한이 없다는 명시적 근거가 없어 확인이 필요합니다.`,
      );
    } else if (
      key === 'departments' &&
      scope.mode === 'specific' &&
      (!scope.values.every((value) =>
        normalizeText(scope.evidence).includes(String(value)),
      ) ||
        !/대상|자격|지원|참여|신청|모집|학생|전공자|소속/.test(scope.evidence))
    ) {
      data.eligibility.departments = {
        mode: 'unknown',
        values: [],
        evidence: scope.evidence,
      };
      note('주관 학과와 지원 대상 학과를 구분할 근거가 부족합니다.');
    }
  }
  if (data.activity && !exists(data.activity.evidence)) {
    data.activity = null;
    note('활동 정보의 근거를 원문에서 확인할 수 없습니다.');
  }
  data.checklist = data.checklist.filter((item) => {
    if (exists(item.evidence)) return true;
    note(
      '근거를 확인할 수 없는 준비 항목을 제외했습니다. 원문 확인이 필요합니다.',
    );
    return false;
  });

  data.events = data.events.map((event) => {
    if (!exists(event.evidence)) {
      note(`${event.label}: 일정 근거를 원문에서 확인할 수 없습니다.`);
      return asReview(event);
    }
    const evidence = normalizeText(event.evidence);
    let result = event;
    if (
      event.status === 'resolved' &&
      !fullDates(evidence).includes(event.date)
    ) {
      note(`${event.label}: 해당 날짜의 연·월·일 근거가 불명확합니다.`);
      result = asReview(result);
    }
    if (event.time !== null && !hasTime(evidence, event.time)) {
      note(`${event.label}: 원문에서 확인되지 않은 시각을 제외했습니다.`);
      result =
        result.status === 'resolved'
          ? { ...result, time: null, precision: 'date' }
          : {
              ...result,
              time: null,
              precision: result.date === null ? 'unknown' : 'date',
            };
    }
    return result;
  });

  // 같은 유형에 서로 다른 후보가 있으면 단계·회차 의미를 코드로 확정할 수 없다.
  for (const type of new Set(data.events.map((event) => event.type))) {
    const candidates = data.events.filter((event) => event.type === type);
    const dates = new Set(
      candidates.map((event) => `${event.date}/${event.time}`),
    );
    if (candidates.length > 1 && dates.size > 1) {
      data.events = data.events.map((event) =>
        event.type === type ? asReview(event) : event,
      );
      note(
        `${eventLabels[type]}: 복수 일정의 단계와 충돌 여부를 원문에서 확인해야 합니다.`,
      );
    }
  }
  if (
    data.application_url !== null &&
    !inputUrls(input).has(new URL(data.application_url).href)
  ) {
    data.application_url = null;
    note('입력 링크·본문에서 확인되지 않은 신청 주소를 제외했습니다.');
  }
  if (input.attachments.length > 0)
    note('첨부파일 내용은 분석하지 않았습니다. 원문에서 첨부를 확인하세요.');
  if (input.has_body_images)
    note(
      '본문 이미지 내용은 분석하지 않았습니다. 원문에서 이미지를 확인하세요.',
    );
  data.review_notes = [
    ...new Set(
      data.review_notes.map((message) =>
        message.replaceAll('needs_review', '확인 필요'),
      ),
    ),
  ];
  return noticeAnalysisSchema.parse(data);
}
