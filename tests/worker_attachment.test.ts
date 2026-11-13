import assert from 'node:assert/strict';
import test from 'node:test';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';
import { hashNoticeContent } from '../shared/canonicalize';
import { analyzeNoticeRequestSchema } from '../shared/contracts';
import { analysisCacheKey } from '../worker/src/analysisCache';
import { sha256 } from '../worker/src/http';
import { createWorker } from '../worker/src/index';

test('첨부 입력은 본문 해시와 분리되고 Worker가 실제 첨부 근거만 보존한다', async () => {
  const { request, analysis } = normalNoticeFixture;
  const folder = { name: '안내.hwpx', url: null };
  const base = { ...request, attachments: [folder] };
  const text = {
    attachment_index: 0,
    sha256: 'a'.repeat(64),
    text: '재학증명서 1부 제출',
  };
  const enriched = { ...base, attachment_texts: [text] };
  const changed = {
    ...base,
    attachment_texts: [{ ...text, sha256: 'b'.repeat(64) }],
  };
  assert.equal(await hashNoticeContent(request, sha256), request.content_hash);
  assert.notEqual(
    await hashNoticeContent(base, sha256),
    await hashNoticeContent(enriched, sha256),
  );
  assert.notEqual(
    await hashNoticeContent(enriched, sha256),
    await hashNoticeContent(changed, sha256),
  );
  assert.notEqual(
    await analysisCacheKey(enriched, 'test-model'),
    await analysisCacheKey(changed, 'test-model'),
  );
  assert.equal(
    analyzeNoticeRequestSchema.safeParse({
      ...enriched,
      attachment_texts: [{ ...text, attachment_index: 1 }],
    }).success,
    false,
  );

  const token = 'test-only-token';
  let calls = 0;
  const worker = createWorker({
    log() {},
    fetch: async (_url, init) => {
      calls++;
      const payload = JSON.parse(String(init?.body));
      const user = JSON.parse(payload.contents[0].parts[0].text);
      assert.deepEqual(user.attachment_texts, [
        { name: folder.name, text: text.text },
      ]);
      return Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ...analysis.data,
                    checklist: [
                      { text: '재학증명서 1부', evidence: text.text },
                      {
                        text: '신분증 제출',
                        evidence: '원문에 없는 후속 서류',
                      },
                    ],
                    review_notes: [],
                  }),
                },
              ],
            },
          },
        ],
      });
    },
  });
  const env = {
    GEMINI_API_KEY: 'test-only-key',
    GEMINI_MODEL: 'test-model',
    ANALYSIS_ENABLED: 'true',
    DEMO_TOKEN_SHA256: await sha256(token),
    DEMO_TOKEN_EXPIRES_AT: '2099-01-01T00:00:00Z',
    ANALYZE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
  const send = (content_hash: string) =>
    worker.fetch(
      new Request('https://worker.example/analyze-notice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ ...enriched, content_hash }),
      }),
      env,
    );
  assert.equal((await send(request.content_hash)).status, 400);
  assert.equal(calls, 0);
  const response = await send(await hashNoticeContent(enriched, sha256));
  assert.equal(response.status, 200);
  const output = await response.json();
  assert.deepEqual(output.data.checklist, [
    { text: '재학증명서 1부 · 출처: 안내.hwpx', evidence: text.text },
  ]);
  assert.equal(calls, 1);
});

test('파일럿 공지는 Worker가 학교에서 첨부를 읽고 원래 앱 해시로 응답한다', async () => {
  const { readFile } = await import('node:fs/promises');
  const { zipSync, strToU8 } = await import('fflate');
  const { toAnalyzeNoticeRequest } = await import('../shared/mappers');
  const recorded = (
    await import('../fixtures/real/t09/verified.json', {
      with: { type: 'json' },
    })
  ).default;
  const input = toAnalyzeNoticeRequest(
    recorded.notice as Parameters<typeof toAnalyzeNoticeRequest>[0],
  );
  const html = await readFile('fixtures/real/t09/general_897698.html', 'utf8');
  const zip = zipSync({
    'Contents/section0.xml': strToU8(
      '<p xmlns="urn:test"><t>재학증명서 제출</t></p>',
    ),
  });
  const token = 'test-only-pilot-token';
  const calls: string[] = [];
  let schoolAvailable = true;
  const worker = createWorker({
    log() {},
    fetch: async (url, init) => {
      const parsed = new URL(String(url));
      calls.push(parsed.pathname);
      if (parsed.hostname === 'www.seoultech.ac.kr') {
        assert.equal(new Headers(init?.headers).has('Authorization'), false);
        if (!schoolAvailable) return new Response(null, { status: 503 });
        if (parsed.pathname === '/service/info/notice') {
          assert.equal(parsed.searchParams.get('bidx'), '897698');
          return new Response(html);
        }
        return new Response(Uint8Array.from(zip));
      }
      const modelInput = JSON.parse(
        JSON.parse(String(init?.body)).contents[0].parts[0].text,
      );
      assert.equal(
        modelInput.attachment_texts?.[0]?.text,
        schoolAvailable && calls.length > 1 ? '재학증명서 제출' : undefined,
      );
      return Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ...recorded.envelope.data,
                    checklist: [
                      { text: '재학증명서', evidence: '재학증명서 제출' },
                    ],
                    review_notes: [],
                  }),
                },
              ],
            },
          },
        ],
      });
    },
  });
  const env = {
    GEMINI_API_KEY: 'test-only-key',
    GEMINI_MODEL: 'test-model',
    ANALYSIS_ENABLED: 'true',
    DEMO_TOKEN_SHA256: await sha256(token),
    DEMO_TOKEN_EXPIRES_AT: '2099-01-01T00:00:00Z',
    ANALYZE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
  const send = (pilot?: string) =>
    worker.fetch(
      new Request('https://worker.example/analyze-notice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(input),
      }),
      { ...env, ...(pilot ? { HWPX_PILOT_NOTICE_ID: pilot } : {}) },
    );
  const disabled = await send();
  assert.equal(disabled.status, 200);
  assert.equal(calls.length, 1);
  calls.length = 0;
  const result = await send(input.notice_id);
  assert.equal(result.status, 200);
  assert.deepEqual(calls.slice(0, 2), [
    '/service/info/notice',
    '/hcm/bbs/bbs_download.jsp',
  ]);
  const output = await result.json();
  assert.equal(output.content_hash, input.content_hash);
  assert.match(output.data.checklist[0].text, /출처:.*\.hwpx$/);
  calls.length = 0;
  schoolAvailable = false;
  const fallback = await send(input.notice_id);
  assert.equal(fallback.status, 200);
  assert.deepEqual((await fallback.json()).data.checklist, []);
  assert.equal(calls.length, 2);
});
