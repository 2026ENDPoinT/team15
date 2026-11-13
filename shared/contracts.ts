import { z } from 'zod';

export const SCHEMA_VERSION = '1.1';
export const EXTRACTOR_VERSION = 'e2';
export const SUPPORTED_TIMEZONE = 'Asia/Seoul';
export const MAX_BODY_CHARACTERS = 20_000;
export const MAX_LINKS = 30;
export const MAX_ATTACHMENTS = 30;
// 실제 바이트 제한은 Worker가 요청 스트림을 읽을 때 별도로 적용한다.
export const MAX_REQUEST_BYTES = 128 * 1024;

const nonBlank = z.string().min(1).regex(/\S/);
export const httpUrlSchema = z.url({ protocol: /^https?$/ });
export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const dateSchema = z.iso.date();
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const utcTimestampSchema = z.iso.datetime();

export const enrollmentSchema = z.enum(['enrolled', 'leave', 'other']);
export const dispositionSchema = z.enum(['unseen', 'saved', 'dismissed']);
export const progressSchema = z.enum(['saved', 'preparing', 'applied']);
export const basicResultSchema = z.enum([
  'basic_match',
  'mismatch',
  'needs_review',
]);
export const analysisStatusSchema = z.enum([
  'pending',
  'running',
  'ready',
  'failed',
  'unsupported',
]);
export const sourceIdSchema = z.enum(['seoultech_general', 'seoultech_cs']);
const gradeSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const profileSchema = z.strictObject({
  universityId: z.literal('seoultech'),
  department: nonBlank,
  grade: gradeSchema,
  enrollment: enrollmentSchema,
  keywords: z.array(nonBlank),
});

function createScopeSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('mode', [
    z.strictObject({
      mode: z.literal('all'),
      values: z.array(value).length(0),
      evidence: nonBlank,
    }),
    z.strictObject({
      mode: z.literal('specific'),
      values: z.array(value).min(1),
      evidence: nonBlank,
    }),
    z.strictObject({
      mode: z.literal('unknown'),
      values: z.array(value).length(0),
      evidence: nonBlank.nullable(),
    }),
  ]);
}

export const departmentScopeSchema = createScopeSchema(nonBlank);
export const gradeScopeSchema = createScopeSchema(gradeSchema);
export const enrollmentScopeSchema = createScopeSchema(enrollmentSchema);
export const eventTypeSchema = z.enum([
  'application_open',
  'application_close',
  'document_deadline',
  'event_start',
  'event_end',
  'result_announcement',
]);

const eventFields = {
  type: eventTypeSchema,
  label: nonBlank,
  evidence: nonBlank,
};

export const extractedEventSchema = z.union([
  z.strictObject({
    ...eventFields,
    status: z.literal('resolved'),
    date: dateSchema,
    time: z.null(),
    timezone: z.literal(SUPPORTED_TIMEZONE),
    precision: z.literal('date'),
  }),
  z.strictObject({
    ...eventFields,
    status: z.literal('resolved'),
    date: dateSchema,
    time: timeSchema,
    timezone: z.literal(SUPPORTED_TIMEZONE),
    precision: z.literal('datetime'),
  }),
  z.strictObject({
    ...eventFields,
    status: z.literal('needs_review'),
    date: dateSchema.nullable(),
    time: timeSchema.nullable(),
    timezone: nonBlank.nullable(),
    precision: z.enum(['date', 'datetime', 'unknown']),
  }),
]);

export const noticeAnalysisSchema = z.strictObject({
  summary: nonBlank,
  tags: z.array(nonBlank),
  benefits: z.array(nonBlank),
  activity: z
    .strictObject({
      period_text: nonBlank.nullable(),
      frequency_text: nonBlank.nullable(),
      location_text: nonBlank.nullable(),
      evidence: nonBlank,
    })
    .nullable(),
  eligibility: z.strictObject({
    comparison: z.enum(['all_of', 'manual_review']),
    departments: departmentScopeSchema,
    grades: gradeScopeSchema,
    enrollments: enrollmentScopeSchema,
    other_conditions: z.array(nonBlank),
  }),
  events: z.array(extractedEventSchema),
  checklist: z.array(z.strictObject({ text: nonBlank, evidence: nonBlank })),
  application_url: httpUrlSchema.nullable(),
  review_notes: z.array(nonBlank),
});

export const extractedLinkSchema = z.strictObject({
  label: z.string(),
  url: httpUrlSchema,
});
export const attachmentSchema = z.strictObject({
  name: nonBlank,
  url: httpUrlSchema.nullable(),
});

export const attachmentTextSchema = z.strictObject({
  attachment_index: z
    .number()
    .int()
    .min(0)
    .max(MAX_ATTACHMENTS - 1),
  sha256: contentHashSchema,
  text: nonBlank.max(12_000),
});

export const analyzeNoticeRequestSchema = z
  .strictObject({
    notice_id: nonBlank,
    content_hash: contentHashSchema,
    schema_version: z.literal(SCHEMA_VERSION),
    extractor_version: nonBlank,
    title: nonBlank,
    // 이미지 중심 공지도 표현할 수 있도록 빈 본문을 허용한다.
    body_text: z.string().max(MAX_BODY_CHARACTERS),
    // 연도 추정의 보조 근거이며 확정 일정의 근거로 사용하지 않는다.
    published_date: dateSchema.nullable().optional(),
    source_url: httpUrlSchema,
    extracted_links: z.array(extractedLinkSchema).max(MAX_LINKS),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS),
    attachment_texts: z.array(attachmentTextSchema).min(1).max(2).optional(),
    has_body_images: z.boolean(),
  })
  .refine(
    ({ attachments, attachment_texts }) => {
      const indices =
        attachment_texts?.map(({ attachment_index }) => attachment_index) ?? [];
      return (
        new Set(indices).size === indices.length &&
        indices.every((index) => index < attachments.length)
      );
    },
    {
      path: ['attachment_texts'],
      message: 'Attachment text must refer to a unique listed attachment',
    },
  );

export const analysisEnvelopeSchema = z.strictObject({
  notice_id: nonBlank,
  content_hash: contentHashSchema,
  schema_version: z.literal(SCHEMA_VERSION),
  extractor_version: nonBlank,
  analyzed_at: utcTimestampSchema,
  data: noticeAnalysisSchema,
});

export const apiErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'INPUT_TOO_LARGE',
  'UNAUTHORIZED',
  'CONTRACT_MISMATCH',
  'RATE_LIMITED',
  'INVALID_MODEL_OUTPUT',
  'PROVIDER_UNAVAILABLE',
  'TIMEOUT',
]);
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    retryable: z.boolean(),
    retry_after_seconds: z.number().int().nonnegative().nullable(),
  }),
  request_id: nonBlank,
});

const noticeRefFields = {
  id: nonBlank,
  sourceId: sourceIdSchema,
  boardId: z.string().regex(/^\d+$/),
  postId: z.string().regex(/^\d+$/),
  sourceUrl: httpUrlSchema,
  title: nonBlank,
  publishedDate: dateSchema.nullable(),
};
const hasConsistentId = (notice: {
  id: string;
  sourceId: string;
  boardId: string;
  postId: string;
}) => notice.id === `${notice.sourceId}:${notice.boardId}:${notice.postId}`;

export const noticeRefSchema = z
  .strictObject(noticeRefFields)
  .refine(hasConsistentId, {
    message: 'id must be sourceId:boardId:postId',
    path: ['id'],
  });
export const collectedNoticeSchema = z
  .strictObject({
    ...noticeRefFields,
    bodyText: z.string(),
    extractedLinks: z.array(extractedLinkSchema),
    attachments: z.array(attachmentSchema),
    hasBodyImages: z.boolean(),
    sourceUpdatedAt: utcTimestampSchema.nullable(),
    fetchedAt: utcTimestampSchema,
    contentHash: contentHashSchema,
  })
  .refine(hasConsistentId, {
    message: 'id must be sourceId:boardId:postId',
    path: ['id'],
  });

export type Enrollment = z.infer<typeof enrollmentSchema>;
export type Disposition = z.infer<typeof dispositionSchema>;
export type Progress = z.infer<typeof progressSchema>;
export type BasicResult = z.infer<typeof basicResultSchema>;
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;
export type SourceId = z.infer<typeof sourceIdSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Scope<T> = z.infer<
  ReturnType<typeof createScopeSchema<z.ZodType<T>>>
>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type ExtractedEvent = z.infer<typeof extractedEventSchema>;
export type NoticeAnalysis = z.infer<typeof noticeAnalysisSchema>;
export type AnalyzeNoticeRequest = z.infer<typeof analyzeNoticeRequestSchema>;
export type AnalysisEnvelope = z.infer<typeof analysisEnvelopeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type NoticeRef = z.infer<typeof noticeRefSchema>;
export type CollectedNotice = z.infer<typeof collectedNoticeSchema>;
// HTML 파싱은 순수 동기 함수이고, 수집 시각·비동기 SHA-256은 수집 서비스가 붙인다.
export type ParsedNotice = Omit<CollectedNotice, 'fetchedAt' | 'contentHash'>;
export interface ListPageContext {
  html: string;
  responseUrl: string;
}

export interface BoardAdapter {
  sourceId: SourceId;
  listUrl: string;
  buildListUrl(page: number, previousPage?: ListPageContext): string;
  parseList(html: string, responseUrl: string): NoticeRef[];
  parseDetail(html: string, ref: NoticeRef): ParsedNotice;
}

// 구현은 B의 공통 서비스가 제공한다. 화면별로 저장 처리를 중복하지 않는다.
export interface NoticeActions {
  saveNotice(noticeId: string): Promise<void>;
  dismissNotice(noticeId: string): Promise<void>;
  unsaveNotice(noticeId: string): Promise<void>;
  setProgress(noticeId: string, progress: Progress): Promise<void>;
  addChecklistItem(noticeId: string, text: string): Promise<void>;
  deleteChecklistItem(itemId: string): Promise<void>;
  setChecklistCompleted(itemId: string, completed: boolean): Promise<void>;
  acknowledgeDeadlineChange(noticeId: string): Promise<void>;
  refreshNotices(reason: 'launch' | 'foreground' | 'manual'): Promise<void>;
  reconcileReminders(): Promise<void>;
}
