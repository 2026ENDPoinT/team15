import {
  analysisEnvelopeSchema,
  collectedNoticeSchema,
  profileSchema,
  EXTRACTOR_VERSION,
  SCHEMA_VERSION,
  type NoticeAnalysis,
} from '../../shared/contracts';
import { toAnalyzeNoticeRequest } from '../../shared/mappers';

// 실제 수집·AI 응답이 아닌 수작업 샘플이다. 날짜를 자동으로 이동시키지 않는다.
export const DEMO_NOW = '2026-11-13T10:00:00Z';
export const demoProfile = profileSchema.parse({
  universityId: 'seoultech',
  department: '컴퓨터공학과',
  grade: 3,
  enrollment: 'enrolled',
  keywords: ['AI', '해커톤'],
});

const eligibility: NoticeAnalysis['eligibility'] = {
  comparison: 'all_of',
  departments: {
    mode: 'all',
    values: [],
    evidence: '전 학과 2~4학년 재학생을 모집합니다.',
  },
  grades: {
    mode: 'specific',
    values: [2, 3, 4],
    evidence: '전 학과 2~4학년 재학생을 모집합니다.',
  },
  enrollments: {
    mode: 'specific',
    values: ['enrolled'],
    evidence: '전 학과 2~4학년 재학생을 모집합니다.',
  },
  other_conditions: [],
};
const unknownEligibility: NoticeAnalysis['eligibility'] = {
  comparison: 'all_of',
  departments: { mode: 'unknown', values: [], evidence: null },
  grades: { mode: 'unknown', values: [], evidence: null },
  enrollments: { mode: 'unknown', values: [], evidence: null },
  other_conditions: [],
};

function makeFixture(input: {
  key: string;
  postId: string;
  title: string;
  bodyText: string;
  contentHash: string;
  data: NoticeAnalysis;
  hasBodyImages?: boolean;
  attachments?: Array<{ name: string; url: string | null }>;
  extractedLinks?: Array<{ label: string; url: string }>;
}) {
  const notice = collectedNoticeSchema.parse({
    id: `seoultech_cs:58476:${input.postId}`,
    sourceId: 'seoultech_cs',
    boardId: '58476',
    postId: input.postId,
    sourceUrl: `https://example.invalid/synthetic/notices/${input.postId}`,
    title: input.title,
    publishedDate: '2026-11-13',
    bodyText: input.bodyText,
    extractedLinks: input.extractedLinks ?? [],
    attachments: input.attachments ?? [],
    hasBodyImages: input.hasBodyImages ?? false,
    sourceUpdatedAt: null,
    fetchedAt: DEMO_NOW,
    contentHash: input.contentHash,
  });
  return {
    key: input.key,
    kind: 'synthetic' as const,
    notice,
    request: toAnalyzeNoticeRequest(notice),
    analysis: analysisEnvelopeSchema.parse({
      notice_id: notice.id,
      content_hash: notice.contentHash,
      schema_version: SCHEMA_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      analyzed_at: '2026-11-13T10:00:05Z',
      data: input.data,
    }),
  };
}

export const normalNoticeFixture = makeFixture({
  key: 'normal',
  postId: '900000001',
  title: '[가상] AI 캠퍼스 해커톤 참가자 모집',
  bodyText: [
    '전 학과 2~4학년 재학생을 모집합니다.',
    '신청 마감은 2026년 11월 20일 18:00입니다.',
    '행사는 2026년 11월 25일 10:00 교내 창업실에서 진행합니다.',
    '제출 서류는 참가 신청서입니다.',
    '참가자에게 수료증을 제공합니다.',
    '신청 주소: https://example.invalid/synthetic/apply/1',
  ].join('\n'),
  contentHash:
    '485e185b9a675887a7b26bc11f5e452024006a897752bce3a032a720f2559693',
  extractedLinks: [
    {
      label: '신청하기',
      url: 'https://example.invalid/synthetic/apply/1',
    },
  ],
  data: {
    summary:
      '전 학과 2~4학년 재학생 대상 AI 캠퍼스 해커톤 가상 모집 공지입니다.',
    tags: ['AI', '해커톤'],
    benefits: ['수료증'],
    activity: {
      period_text: '2026년 11월 25일 10:00',
      frequency_text: null,
      location_text: '교내 창업실',
      evidence: '행사는 2026년 11월 25일 10:00 교내 창업실에서 진행합니다.',
    },
    eligibility,
    events: [
      {
        type: 'application_close',
        label: '신청 마감',
        status: 'resolved',
        date: '2026-11-20',
        time: '18:00',
        timezone: 'Asia/Seoul',
        precision: 'datetime',
        evidence: '신청 마감은 2026년 11월 20일 18:00입니다.',
      },
      {
        type: 'event_start',
        label: '해커톤 시작',
        status: 'resolved',
        date: '2026-11-25',
        time: '10:00',
        timezone: 'Asia/Seoul',
        precision: 'datetime',
        evidence: '행사는 2026년 11월 25일 10:00 교내 창업실에서 진행합니다.',
      },
    ],
    checklist: [
      {
        text: '참가 신청서 준비',
        evidence: '제출 서류는 참가 신청서입니다.',
      },
    ],
    application_url: 'https://example.invalid/synthetic/apply/1',
    review_notes: [],
  },
});

export const dateOnlyNoticeFixture = makeFixture({
  key: 'date_only',
  postId: '900000002',
  title: '[가상] 교내 아이디어 공모',
  bodyText:
    '신청 마감일은 2026년 11월 20일입니다. 마감 시각은 별도로 안내하지 않습니다.',
  contentHash:
    'a1207bb8d4d99d3b130fe8e623cd2b9b0030786b765f9d232cb07b837fc57b98',
  data: {
    summary: '마감 날짜만 명시된 가상 아이디어 공모 공지입니다.',
    tags: ['공모전'],
    benefits: [],
    activity: null,
    eligibility: unknownEligibility,
    events: [
      {
        type: 'application_close',
        label: '신청 마감',
        status: 'resolved',
        date: '2026-11-20',
        time: null,
        timezone: 'Asia/Seoul',
        precision: 'date',
        evidence: '신청 마감일은 2026년 11월 20일입니다.',
      },
    ],
    checklist: [],
    application_url: null,
    review_notes: ['지원 조건과 마감 시각은 원문 확인이 필요합니다.'],
  },
});

export const unknownYearNoticeFixture = makeFixture({
  key: 'unknown_year',
  postId: '900000003',
  title: '[가상] 선착순 취업 멘토링 안내',
  bodyText: '신청은 선착순으로 마감합니다. 활동은 11월 20일에 진행합니다.',
  contentHash:
    '49c2f29a82eb9ad19a98354dafddbdd42f45dd8589f23f5b2aee938cd182200c',
  data: {
    summary:
      '선착순 모집이며 활동 날짜의 연도를 확인할 수 없는 가상 공지입니다.',
    tags: ['취업', '멘토링'],
    benefits: [],
    activity: {
      period_text: '11월 20일',
      frequency_text: null,
      location_text: null,
      evidence: '활동은 11월 20일에 진행합니다.',
    },
    eligibility: unknownEligibility,
    events: [
      {
        type: 'event_start',
        label: '멘토링 활동일',
        status: 'needs_review',
        date: null,
        time: null,
        timezone: null,
        precision: 'unknown',
        evidence: '활동은 11월 20일에 진행합니다.',
      },
    ],
    checklist: [],
    application_url: null,
    review_notes: [
      '선착순 마감으로 신청 마감 날짜가 없습니다.',
      '활동 날짜의 연도를 확인해야 합니다.',
    ],
  },
});

export const attachmentOnlyNoticeFixture = makeFixture({
  key: 'attachment_only',
  postId: '900000004',
  title: '[가상] 첨부·이미지 모집 안내',
  bodyText: '모집 조건과 제출 서류는 첨부파일과 안내 이미지를 확인하세요.',
  contentHash:
    'c51f5bcb8d16f0a47a2beeeafdde5707935d39e2d9309c8652c2ac6b4ae81324',
  hasBodyImages: true,
  attachments: [{ name: '모집안내.pdf', url: null }],
  data: {
    summary: '모집 세부 내용이 첨부파일과 이미지에 있는 가상 공지입니다.',
    tags: [],
    benefits: [],
    activity: null,
    eligibility: unknownEligibility,
    events: [],
    checklist: [],
    application_url: null,
    review_notes: [
      '첨부파일과 이미지 내용을 분석하지 않았습니다. 원문 확인이 필요합니다.',
    ],
  },
});

// 같은 ID의 후속 본문. 기존 사용자 체크 기록을 초기화하면 안 되는 사례다.
export const changedNoticeFixture = makeFixture({
  key: 'changed',
  postId: '900000001',
  title: normalNoticeFixture.notice.title,
  bodyText: normalNoticeFixture.notice.bodyText
    .replace('2026년 11월 20일 18:00', '2026년 11월 23일 18:00')
    .replace(
      '제출 서류는 참가 신청서입니다.',
      '제출 서류는 참가 신청서와 재학증명서입니다.',
    ),
  contentHash:
    'c5c23e74ddb704d8331b177955996ecc2e5ea53dd87b4af69866c0222fdfb71d',
  extractedLinks: normalNoticeFixture.notice.extractedLinks,
  data: {
    ...normalNoticeFixture.analysis.data,
    events: normalNoticeFixture.analysis.data.events.map((event) =>
      event.type === 'application_close'
        ? {
            ...event,
            date: '2026-11-23',
            evidence: '신청 마감은 2026년 11월 23일 18:00입니다.',
          }
        : event,
    ),
    checklist: [
      {
        text: '참가 신청서 준비',
        evidence: '제출 서류는 참가 신청서와 재학증명서입니다.',
      },
      {
        text: '재학증명서 준비',
        evidence: '제출 서류는 참가 신청서와 재학증명서입니다.',
      },
    ],
  },
});

export const syntheticNoticeFixtures = [
  normalNoticeFixture,
  dateOnlyNoticeFixture,
  unknownYearNoticeFixture,
  attachmentOnlyNoticeFixture,
  changedNoticeFixture,
];
