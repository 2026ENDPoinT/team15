import { createHash } from 'node:crypto';
import { runCollectionSmoke } from '../src/sources/smoke';

try {
  const results = await runCollectionSmoke({
    sha256: async (text) => createHash('sha256').update(text).digest('hex'),
  });
  console.log(
    JSON.stringify(
      results.map(({ notice, ...result }) => ({
        ...result,
        id: notice.id,
        title: notice.title,
        bodyCharacters: notice.bodyText.length,
        links: notice.extractedLinks.length,
        attachments: notice.attachments.length,
        hasBodyImages: notice.hasBodyImages,
        contentHash: notice.contentHash,
        fetchedAt: notice.fetchedAt,
      })),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : '실제 수집 검증 실패');
  process.exitCode = 1;
}
