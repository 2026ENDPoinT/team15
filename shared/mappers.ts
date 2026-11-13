import {
  analyzeNoticeRequestSchema,
  EXTRACTOR_VERSION,
  SCHEMA_VERSION,
  type AnalyzeNoticeRequest,
  type CollectedNotice,
} from './contracts';

// 입력 경계에서만 camelCase → snake_case로 변환한다.
// contentHash 생성은 호출자의 책임이며 Worker가 입력으로 다시 검증해야 한다.
export function toAnalyzeNoticeRequest(
  notice: CollectedNotice,
  extractorVersion = EXTRACTOR_VERSION,
): AnalyzeNoticeRequest {
  return analyzeNoticeRequestSchema.parse({
    notice_id: notice.id,
    content_hash: notice.contentHash,
    schema_version: SCHEMA_VERSION,
    extractor_version: extractorVersion,
    title: notice.title,
    body_text: notice.bodyText,
    published_date: notice.publishedDate,
    source_url: notice.sourceUrl,
    extracted_links: notice.extractedLinks,
    attachments: notice.attachments,
    has_body_images: notice.hasBodyImages,
  });
}
