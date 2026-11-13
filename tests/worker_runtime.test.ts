import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';
import { analysisEnvelopeSchema, apiErrorSchema } from '../shared/contracts';

test('workerd에서 번들·Web Crypto·실제 Rate Limiting binding·응답 계약을 검증한다 (Gemini는 mock)', async () => {
  const bundle = await build({
    entryPoints: ['worker/src/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  let providerCalls = 0;
  const token = 'runtime-test-only-token';
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0]!.text,
      compatibilityDate: '2026-11-10',
      bindings: {
        GEMINI_API_KEY: 'runtime-test-only-key',
        GEMINI_MODEL: 'runtime-test-model',
        ANALYSIS_ENABLED: 'true',
        DEMO_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'),
        DEMO_TOKEN_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
      },
      ratelimits: {
        ANALYZE_RATE_LIMITER: {
          namespace_id: '1505',
          simple: { limit: 2, period: 60 },
        },
      },
      outboundService: async (request) => {
        providerCalls++;
        assert.equal(
          new URL(request.url).hostname,
          'generativelanguage.googleapis.com',
        );
        assert.equal(
          request.headers.get('x-goog-api-key'),
          'runtime-test-only-key',
        );
        return Response.json({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { text: JSON.stringify(normalNoticeFixture.analysis.data) },
                ],
              },
            },
          ],
        });
      },
    }),
  );
  try {
    const send = (authorized = true) =>
      mf.dispatchFetch('https://worker.example/analyze-notice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authorized ? token : 'wrong'}`,
        },
        body: JSON.stringify(normalNoticeFixture.request),
      });
    const unauthorized = await send(false);
    assert.equal(unauthorized.status, 401);
    for (let index = 0; index < 2; index++) {
      const response = await send();
      assert.equal(response.status, 200);
      const envelope = analysisEnvelopeSchema.parse(await response.json());
      assert.equal(
        envelope.content_hash,
        normalNoticeFixture.request.content_hash,
      );
      assert.deepEqual(envelope.data, normalNoticeFixture.analysis.data);
    }
    const limited = await send();
    assert.equal(limited.status, 429);
    assert.equal(
      apiErrorSchema.parse(await limited.json()).error.code,
      'RATE_LIMITED',
    );
    assert.equal(providerCalls, 2);
  } finally {
    await mf.dispose();
  }
});
