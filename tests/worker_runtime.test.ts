import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';
import { analysisEnvelopeSchema, apiErrorSchema } from '../shared/contracts';

for (const cacheEnabled of [false, true]) {
  test(`workerd에서 인증·제한·응답과 공용 캐시=${cacheEnabled}를 검증한다 (Gemini는 mock)`, async () => {
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
        ...(cacheEnabled
          ? {
              durableObjects: {
                ANALYSIS_CACHE: { className: 'AnalysisCache', useSQLite: true },
              },
            }
          : {}),
        bindings: {
          GEMINI_API_KEY: 'runtime-test-only-key',
          GEMINI_MODEL: 'runtime-test-model',
          ANALYSIS_ENABLED: 'true',
          // workerd does not implement jurisdiction restrictions; production
          // placement must be verified separately after deployment.
          ANALYSIS_CACHE_JURISDICTION: 'local',
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
          await new Promise((resolve) => setTimeout(resolve, 30));
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
      const send = (authorized = true, publishedDate?: string) =>
        mf.dispatchFetch('https://worker.example/analyze-notice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authorized ? token : 'wrong'}`,
          },
          body: JSON.stringify({
            ...normalNoticeFixture.request,
            ...(publishedDate ? { published_date: publishedDate } : {}),
          }),
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
      if (cacheEnabled) {
        // Persistent cache hits do not consume the two-request provider budget.
        for (let index = 0; index < 3; index++)
          assert.equal((await send()).status, 200);
        assert.equal(providerCalls, 1);
        assert.equal((await send(false)).status, 401);
        const concurrent = await Promise.all(
          Array.from({ length: 5 }, () => send(true, '2026-11-12')),
        );
        assert.ok(concurrent.every((response) => response.status === 200));
        assert.equal(providerCalls, 2);
      }
      const limited = await send(true, cacheEnabled ? '2026-11-11' : undefined);
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
}
