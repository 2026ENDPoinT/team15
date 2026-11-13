import { mkdir, writeFile } from 'node:fs/promises';
import { collectBoards } from '../src/sources/collector';
import { nodeSha256 } from './node_notice_repository';

// Read-only public collection; no AI calls and no changes to the app database.
const results = await collectBoards(
  { sha256: nodeSha256 },
  { maxPages: 2, maxNotices: 15 },
);
await mkdir('dist/t09-candidates', { recursive: true });
await writeFile(
  'dist/t09-candidates/latest.json',
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      input_kind: 'live_html',
      device_validation: false,
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    results.map(({ sourceId, status, notices, failures }) => ({
      sourceId,
      status,
      failures,
      notices: notices.map(({ id, title, bodyText, sourceUrl }) => ({
        id,
        title,
        sourceUrl,
        dateLines: bodyText
          .split('\n')
          .filter((line) => /2026|2027|마감|접수|제출|서류/.test(line)),
      })),
    })),
    null,
    2,
  ),
);
if (results.every(({ status }) => status === 'failed')) process.exitCode = 1;
