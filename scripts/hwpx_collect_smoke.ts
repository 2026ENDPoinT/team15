import { readFile } from 'node:fs/promises';
import recorded from '../fixtures/real/t09/verified.json' with { type: 'json' };
import { collectedNoticeSchema } from '../shared/contracts';
import { toAnalyzeNoticeRequest } from '../shared/mappers';
import { enrichSeoultechHwpx } from './seoultech_hwpx';

const html = await readFile(
  new URL('../fixtures/real/t09/general_897698.html', import.meta.url),
  'utf8',
);
const { request, warnings } = await enrichSeoultechHwpx(
  html,
  toAnalyzeNoticeRequest(collectedNoticeSchema.parse(recorded.notice)),
);
for (const warning of warnings) console.warn(warning);
if (request.attachment_texts?.length) {
  // stdout is a Worker-ready request. This command does not send it.
  console.log(JSON.stringify(request));
} else {
  process.exitCode = 1;
}
