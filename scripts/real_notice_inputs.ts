import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hashNoticeContent } from '../shared/canonicalize';
import { toAnalyzeNoticeRequest } from '../shared/mappers';
import { createBoardAdapter } from '../src/sources/boards';
import manifest from '../fixtures/real/seoultech/manifest.json';

export async function realNoticeInputs() {
  const cases = [
    { sourceId: 'seoultech_general', prefix: 'general', postId: '897750' },
    { sourceId: 'seoultech_cs', prefix: 'cs', postId: '897737' },
  ] as const;
  return Promise.all(
    cases.map(async ({ sourceId, prefix, postId }) => {
      const read = (name: string) => {
        const bytes = readFileSync(
          new URL(`../fixtures/real/seoultech/${name}.html`, import.meta.url),
        );
        const entry = manifest.find((item) => item.file === `${name}.html`)!;
        if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
          throw new Error('실제 fixture의 캡처 해시가 다릅니다.');
        return bytes.toString('utf8');
      };
      const adapter = createBoardAdapter(sourceId);
      const ref = adapter
        .parseList(read(`${prefix}_list`), adapter.listUrl)
        .find((item) => item.postId === postId)!;
      const notice = adapter.parseDetail(read(`${prefix}_detail`), ref);
      const contentHash = await hashNoticeContent(
        {
          title: notice.title,
          body_text: notice.bodyText,
          extracted_links: notice.extractedLinks,
          attachments: notice.attachments,
          has_body_images: notice.hasBodyImages,
        },
        async (text) => createHash('sha256').update(text).digest('hex'),
      );
      return toAnalyzeNoticeRequest({
        ...notice,
        contentHash,
        fetchedAt: manifest.find(
          (item) => item.file === `${prefix}_detail.html`,
        )!.capturedAt,
      });
    }),
  );
}
