import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalNoticeFixture,
  dateOnlyNoticeFixture,
  attachmentOnlyNoticeFixture,
} from '../fixtures/synthetic/notices';
import { realNoticeInputs } from '../scripts/real_notice_inputs';
import type { NoticeAnalysis } from '../shared/contracts';
import { validateAnalysis } from '../worker/src/validate';

const input = normalNoticeFixture.request;
const output = normalNoticeFixture.analysis.data;
const copy = () => structuredClone(output);

test('조건이 생략된 모집 대상과 주관 학과를 지원 제한 근거로 오인하지 않는다', () => {
  const data = copy();
  const body =
    '모집 대상: 서울과학기술대학교 한국인 재학생. 정보통신대학 컴퓨터공학과에서는 프로그램을 운영합니다.';
  data.eligibility.departments = {
    mode: 'all',
    values: [],
    evidence: '모집 대상: 서울과학기술대학교 한국인 재학생',
  };
  assert.equal(
    validateAnalysis({ ...input, body_text: body }, data).eligibility
      .departments.mode,
    'unknown',
  );
  data.eligibility.departments = {
    mode: 'specific',
    values: ['컴퓨터공학과'],
    evidence: '정보통신대학 컴퓨터공학과에서는',
  };
  assert.equal(
    validateAnalysis({ ...input, body_text: body }, data).eligibility
      .departments.mode,
    'unknown',
  );
  const explicit = '모집 대상: 컴퓨터공학과 재학생';
  data.eligibility.departments.evidence = explicit;
  assert.equal(
    validateAnalysis({ ...input, body_text: explicit }, data).eligibility
      .departments.mode,
    'specific',
  );
});

test('하나의 명시적 날짜 범위에 연결된 연도는 끝 날짜에도 사용할 수 있다', () => {
  for (const evidence of [
    '방문 일정: 2026. 12. 14.(월)~12.15.(화), 1박 2일',
    '2026년 12월 14일부터 15일까지 활동',
  ]) {
    const data = copy();
    data.events = [
      {
        type: 'event_end',
        label: '활동 종료',
        status: 'resolved',
        date: '2026-12-15',
        time: null,
        timezone: 'Asia/Seoul',
        precision: 'date',
        evidence,
      },
    ];
    assert.equal(
      validateAnalysis({ ...input, body_text: evidence }, data).events[0]!
        .status,
      'resolved',
    );
  }
});

test('날짜 범위가 연도를 넘는지는 임의로 확정하지 않는다', () => {
  const evidence = '일정: 2026.12.31.~1.2.';
  const data = copy();
  data.events = [
    {
      type: 'event_end',
      label: '활동 종료',
      status: 'resolved',
      date: '2027-01-02',
      time: null,
      timezone: 'Asia/Seoul',
      precision: 'date',
      evidence,
    },
  ];
  assert.equal(
    validateAnalysis({ ...input, body_text: evidence }, data).events[0]!.status,
    'needs_review',
  );
});

test('없는 근거는 대상 unknown·활동 null·체크 제외·일정 needs_review로 낮춘다', () => {
  const data = copy();
  data.eligibility.grades.evidence = '원문에 없는 근거';
  data.activity = {
    period_text: '이번 주',
    frequency_text: null,
    location_text: null,
    evidence: '없는 활동',
  };
  data.checklist.push({ text: '창작한 서류', evidence: '없는 서류' });
  data.events[0]!.evidence = '없는 마감';
  const result = validateAnalysis(input, data);
  assert.deepEqual(result.eligibility.grades, {
    mode: 'unknown',
    values: [],
    evidence: null,
  });
  assert.equal(result.activity, null);
  assert.ok(!result.checklist.some((item) => item.text === '창작한 서류'));
  assert.equal(result.events[0]!.status, 'needs_review');
  assert.equal(result.events[0]!.evidence, '없는 마감');
  assert.ok(result.review_notes.length >= 4);
  assert.equal(
    data.eligibility.grades.evidence,
    '원문에 없는 근거',
    '입력 객체를 변경하지 않는다',
  );
});

test('일정 근거에 연도가 없으면 제목·다른 문장의 연도를 가져오지 않는다', () => {
  const data = copy();
  data.events = [
    {
      ...data.events[0]!,
      date: '2026-11-20',
      evidence: '신청은 11월 20일까지입니다.',
    },
  ];
  const result = validateAnalysis(
    {
      ...input,
      title: '2026년 모집',
      body_text: '행사는 2026년입니다. 신청은 11월 20일까지입니다.',
    },
    data,
  );
  assert.equal(result.events[0]!.status, 'needs_review');
});

test('연도 숫자가 다른 문맥에 있거나 월·일이 다르면 확정하지 않는다', () => {
  for (const evidence of [
    '참가비 2026원. 신청은 11월 20일.',
    '마감은 2026년 11월 21일입니다.',
  ]) {
    const data = copy();
    data.events = [{ ...data.events[0]!, evidence }];
    assert.equal(
      validateAnalysis({ ...input, body_text: evidence }, data).events[0]!
        .status,
      'needs_review',
    );
  }
});

test('원문 시각이 없으면 23:59를 만들지 않고 날짜만 보존한다', () => {
  const fixture = dateOnlyNoticeFixture;
  const data = structuredClone(fixture.analysis.data);
  data.events = [
    {
      ...data.events[0]!,
      status: 'resolved',
      date: data.events[0]!.date!,
      time: '23:59',
      precision: 'datetime',
      timezone: 'Asia/Seoul',
    },
  ];
  const result = validateAnalysis(fixture.request, data);
  assert.equal(result.events[0]!.status, 'resolved');
  assert.equal(result.events[0]!.precision, 'date');
  assert.equal(result.events[0]!.time, null);
});

test('명시된 한국어 오후 시각과 점 구분 날짜를 확인한다', () => {
  const evidence = '신청 마감은 2026. 11. 20. 오후 6시 30분입니다.';
  const data = copy();
  data.events = [
    {
      ...data.events[0]!,
      status: 'resolved',
      date: '2026-11-20',
      timezone: 'Asia/Seoul',
      precision: 'datetime',
      time: '18:30',
      evidence,
    },
  ];
  const result = validateAnalysis({ ...input, body_text: evidence }, data);
  assert.equal(result.events[0]!.status, 'resolved');
  assert.equal(result.events[0]!.time, '18:30');
});

test('서로 다른 복수 마감은 후보를 보존하며 자동 일정에서 제외한다', () => {
  const first = '신청 마감은 2026년 11월 20일 18:00입니다.';
  const second = '신청 마감은 2026년 11월 21일 18:00입니다.';
  const data = copy();
  data.events = [
    { ...data.events[0]!, evidence: first },
    {
      ...data.events[0]!,
      date: '2026-11-21',
      label: '추가 마감',
      evidence: second,
    },
  ];
  const result = validateAnalysis(
    { ...input, body_text: `${first}\n${second}` },
    data,
  );
  assert.equal(result.events.length, 2);
  assert.ok(result.events.every((event) => event.status === 'needs_review'));
});

test('신청 URL은 링크·본문의 완전한 URL과 대조하며 접두사와 첨부만의 주소는 거절한다', () => {
  const url = 'https://example.invalid/apply';
  for (const patch of [
    { body_text: `${url}-forged`, extracted_links: [] },
    {
      body_text: '',
      extracted_links: [],
      attachments: [{ name: '신청', url }],
    },
  ]) {
    assert.equal(
      validateAnalysis(
        { ...input, ...patch },
        { ...copy(), application_url: url },
      ).application_url,
      null,
    );
  }
  assert.equal(
    validateAnalysis(
      { ...input, body_text: `신청 (${url}).`, extracted_links: [] },
      { ...copy(), application_url: url },
    ).application_url,
    url,
  );
  assert.equal(
    validateAnalysis(
      { ...input, body_text: '', extracted_links: [{ label: '', url }] },
      { ...copy(), application_url: url },
    ).application_url,
    url,
  );
});

test('정규화된 한글·공백 근거를 확인하며 첨부·이미지 미확인 안내를 강제로 유지한다', () => {
  const data = copy();
  data.checklist = [
    {
      text: '참가 신청서',
      evidence: '제출\t서류는  참가 신청서입니다.'.normalize('NFD'),
    },
  ];
  assert.equal(validateAnalysis(input, data).checklist.length, 1);
  const attachment = validateAnalysis(
    attachmentOnlyNoticeFixture.request,
    attachmentOnlyNoticeFixture.analysis.data,
  );
  assert.deepEqual(attachment.checklist, []);
  assert.ok(attachment.review_notes.some((note) => note.includes('첨부파일')));
  assert.ok(
    validateAnalysis(
      { ...input, has_body_images: true },
      copy(),
    ).review_notes.some((note) => note.includes('이미지')),
  );
});

test('실제 두 HTML 표본에서 연도 없는 일정·선착순·이미지·첨부를 검증한다 (모델 출력은 수작업)', async () => {
  for (const request of await realNoticeInputs()) {
    const data: NoticeAnalysis = {
      summary: '테스트용 수작업 응답이며 실제 AI 출력이 아닙니다.',
      tags: [],
      benefits: [],
      activity: null,
      eligibility: {
        comparison: 'all_of',
        departments: { mode: 'unknown', values: [], evidence: null },
        grades: { mode: 'unknown', values: [], evidence: null },
        enrollments: { mode: 'unknown', values: [], evidence: null },
        other_conditions: [],
      },
      events: [],
      checklist: [],
      application_url: request.extracted_links[0]?.url ?? null,
      review_notes: [],
    };
    if (request.notice_id.startsWith('seoultech_cs:')) {
      assert.match(request.body_text, /선착순 마감/);
      data.events = [
        {
          type: 'event_start',
          label: '멘토링 시작',
          status: 'resolved',
          date: '2026-11-02',
          time: null,
          timezone: 'Asia/Seoul',
          precision: 'date',
          evidence: '11.2.(월)~12.23.(수)',
        },
      ];
    } else {
      const evidence = request.body_text
        .split('\n')
        .find((line) => line.includes('신청 기간:'))!;
      assert.ok(evidence, request.body_text);
      data.events = [
        {
          type: 'application_close',
          label: '신청 마감',
          status: 'resolved',
          date: '2026-11-16',
          time: null,
          timezone: 'Asia/Seoul',
          precision: 'date',
          evidence,
        },
      ];
    }
    const result = validateAnalysis(request, data);
    assert.equal(result.events[0]!.status, 'needs_review');
    assert.ok(
      result.review_notes.some((note) =>
        note.includes(request.has_body_images ? '이미지' : '첨부파일'),
      ),
    );
    assert.deepEqual(result.checklist, []);
  }
});
