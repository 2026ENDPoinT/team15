import { contentHashSchema, type AnalyzeNoticeRequest } from './contracts';

export const CANONICALIZATION_VERSION = 'c1';
export type NoticeContent = Pick<
  AnalyzeNoticeRequest,
  | 'title'
  | 'body_text'
  | 'extracted_links'
  | 'attachments'
  | 'has_body_images'
  | 'attachment_texts'
>;

// HTML entity 해석과 태그 제거는 수집 어댑터에서 먼저 수행한다.
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t \u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeUrl(url: string): string {
  // 검색 파라미터·순서·fragment는 링크의 의미를 바꿀 수 있어 보존한다.
  return new URL(url).href;
}

function sortUnique<T>(items: T[]): T[] {
  const entries = new Map(items.map((item) => [JSON.stringify(item), item]));
  // localeCompare를 쓰지 않아 기기 언어와 무관한 정렬을 유지한다.
  return [...entries.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, item]) => item);
}

export function canonicalizeNoticeContent(content: NoticeContent): string {
  return JSON.stringify({
    canonicalization_version: CANONICALIZATION_VERSION,
    title: normalizeText(content.title),
    body_text: normalizeText(content.body_text),
    extracted_links: sortUnique(
      content.extracted_links.map((link) => ({
        label: normalizeText(link.label),
        url: normalizeUrl(link.url),
      })),
    ),
    attachments: sortUnique(
      content.attachments.map((attachment) => ({
        name: normalizeText(attachment.name),
        url: attachment.url === null ? null : normalizeUrl(attachment.url),
      })),
    ),
    has_body_images: content.has_body_images,
    ...(content.attachment_texts?.length
      ? {
          attachment_texts: sortUnique(
            content.attachment_texts.map(
              ({ attachment_index, sha256, text }) => {
                const attachment = content.attachments[attachment_index]!;
                return {
                  name: normalizeText(attachment.name),
                  url:
                    attachment.url === null
                      ? null
                      : normalizeUrl(attachment.url),
                  sha256,
                  text: normalizeText(text),
                };
              },
            ),
          ),
        }
      : {}),
  });
}

// 플랫폼별 UTF-8 SHA-256 구현을 주입한다. shared는 Node/Expo SDK를 import하지 않는다.
export async function hashNoticeContent(
  content: NoticeContent,
  sha256: (utf8Text: string) => Promise<string>,
): Promise<string> {
  return contentHashSchema.parse(
    await sha256(canonicalizeNoticeContent(content)),
  );
}
