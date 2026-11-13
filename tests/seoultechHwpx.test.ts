import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import recorded from '../fixtures/real/t09/verified.json' with { type: 'json' };
import { collectedNoticeSchema } from '../shared/contracts';
import { hashNoticeContent } from '../shared/canonicalize';
import { toAnalyzeNoticeRequest } from '../shared/mappers';
import { enrichSeoultechHwpx } from '../scripts/seoultech_hwpx';

const hash = async (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');

test('897698의 첨부 폼으로 실제 표시 파일을 요청하고 응답 바이트를 분석 입력에 연결한다', async () => {
  const html = await readFile('fixtures/real/t09/general_897698.html', 'utf8');
  const base = toAnalyzeNoticeRequest(
    collectedNoticeSchema.parse(recorded.notice),
  );
  const bytes = new Uint8Array([80, 75, 3, 4, 5]);
  const enriched = await enrichSeoultechHwpx(html, base, {
    fetchAttachment: async (url, init) => {
      assert.equal(
        String(url),
        'https://www.seoultech.ac.kr/hcm/bbs/bbs_download.jsp',
      );
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      const form = init?.body as URLSearchParams;
      assert.equal(form.get('fpath'), '/storage/www/bbs/4691');
      assert.equal(form.get('fname'), '35922C4581B840F094AE81554FDD3BDB_.hwpx');
      assert.equal(form.get('ogrfname'), base.attachments[0]?.name);
      return new Response(bytes);
    },
    extract: async (input) => {
      assert.deepEqual([...input], [...bytes]);
      return '재(휴)학증명서 제출';
    },
  });
  assert.deepEqual(enriched.warnings, []);
  assert.deepEqual(enriched.request.attachment_texts, [
    {
      attachment_index: 0,
      sha256: await hash(bytes),
      text: '재(휴)학증명서 제출',
    },
  ]);
  assert.notEqual(enriched.request.content_hash, base.content_hash);
  assert.equal(
    enriched.request.content_hash,
    await hashNoticeContent(enriched.request, hash),
  );

  const fallback = await enrichSeoultechHwpx(html, base, {
    fetchAttachment: async () => new Response('<html>download error</html>'),
    extract: async () => {
      throw new Error('HTML must not enter the parser');
    },
  });
  assert.equal(fallback.request, base);
  assert.match(fallback.warnings[0]!, /not an HWPX ZIP/);
});
