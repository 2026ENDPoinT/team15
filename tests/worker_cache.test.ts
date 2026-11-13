import assert from 'node:assert/strict';
import test from 'node:test';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';
import {
  AnalysisCache,
  analysisCacheKey,
  CACHE_TTL_MS,
} from '../worker/src/analysisCache';
import type { WorkerEnv } from '../worker/src/types';

test('공용 캐시 키는 본문·게시일·모델·분석 버전 변경을 구분한다', async () => {
  const input = normalNoticeFixture.request;
  const key = await analysisCacheKey(input, 'model-a');
  assert.equal(key, await analysisCacheKey(structuredClone(input), 'model-a'));
  for (const patch of [
    { body_text: input.body_text + ' 변경' },
    { published_date: '2020-01-01' },
    { notice_id: 'another-notice' },
    { extractor_version: 'e-next' },
  ]) {
    assert.notEqual(
      key,
      await analysisCacheKey({ ...input, ...patch }, 'model-a'),
    );
  }
  assert.notEqual(key, await analysisCacheKey(input, 'model-b'));
});

test('공용 캐시는 동시 호출·객체 재생성에 재사용하고 실패·만료 결과는 재분석한다', async (t) => {
  let calls = 0;
  let fail = true;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (fail)
      return Response.json(
        { error: { message: 'unavailable' } },
        { status: 503 },
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
  });
  const values = new Map<string, unknown>();
  let alarm = 0;
  const state = {
    storage: {
      async get<T>(key: string) {
        return structuredClone(values.get(key)) as T | undefined;
      },
      async put(key: string, value: unknown) {
        values.set(key, structuredClone(value));
      },
      async setAlarm(time: number) {
        alarm = time;
      },
      async deleteAll() {
        values.clear();
      },
    },
  };
  const env: WorkerEnv = {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'test-model',
    ANALYSIS_ENABLED: 'true',
    DEMO_TOKEN_SHA256: '',
    DEMO_TOKEN_EXPIRES_AT: '',
    ANALYZE_RATE_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
  };
  const request = () =>
    new Request('https://internal/', {
      method: 'POST',
      body: JSON.stringify({
        input: normalNoticeFixture.request,
        tokenId: 'test-token-hash',
      }),
    });
  const object = new AnalysisCache(state, env);
  assert.equal((await object.fetch(request())).status, 503);
  assert.equal(values.size, 0);
  fail = false;
  const results = await Promise.all(
    Array.from({ length: 5 }, () => object.fetch(request())),
  );
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(calls, 2);
  assert.ok(alarm > Date.now() + CACHE_TTL_MS - 5000);
  const first = (await results[0]!.json()) as { envelope: unknown };
  const restarted = new AnalysisCache(state, env);
  const cached = (await (await restarted.fetch(request())).json()) as {
    envelope: unknown;
  };
  assert.deepEqual(cached.envelope, first.envelope);
  assert.equal(calls, 2);
  const entry = values.get('analysis') as { expiresAt: number };
  entry.expiresAt = 0;
  assert.equal((await restarted.fetch(request())).status, 200);
  assert.equal(calls, 3);
  await restarted.alarm();
  assert.equal(values.size, 1);
  (values.get('analysis') as { expiresAt: number }).expiresAt = 0;
  await restarted.alarm();
  assert.equal(values.size, 0);
});
