import assert from 'node:assert/strict';
import test from 'node:test';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';
import {
  analysisEnvelopeSchema,
  apiErrorSchema,
  MAX_REQUEST_BYTES,
  EXTRACTOR_VERSION,
} from '../shared/contracts';
import { hashNoticeContent } from '../shared/canonicalize';
import { hashProbe, hashProbeExpected } from '../src/sources/smoke';
import { createWorker } from '../worker/src/index';
import { sha256 } from '../worker/src/http';
import { modelOutputSchema, SYSTEM_INSTRUCTION } from '../worker/src/prompt';
import type {
  RequestLog,
  WorkerDependencies,
  WorkerEnv,
} from '../worker/src/types';

const token = 'test-only-demo-access-token';
const now = () => new Date('2026-11-13T13:00:00Z');
const normalInput = normalNoticeFixture.request;
const normalOutput = normalNoticeFixture.analysis.data;
const providerResponse = (
  data: unknown = normalOutput,
  finishReason = 'STOP',
) =>
  Response.json({
    candidates: [
      { finishReason, content: { parts: [{ text: JSON.stringify(data) }] } },
    ],
    usageMetadata: { totalTokenCount: 123 },
  });

async function harness(
  overrides: Partial<WorkerDependencies> = {},
  patch: Partial<WorkerEnv> = {},
) {
  let calls = 0;
  const rateKeys: string[] = [];
  const logs: RequestLog[] = [];
  const env: WorkerEnv = {
    GEMINI_API_KEY: 'test-only-provider-key',
    GEMINI_MODEL: 'test-model',
    DEMO_TOKEN_SHA256: await sha256(token),
    DEMO_TOKEN_EXPIRES_AT: '2026-11-14T13:00:00Z',
    ANALYSIS_ENABLED: 'true',
    ANALYZE_RATE_LIMITER: {
      async limit({ key }) {
        rateKeys.push(key);
        return { success: true };
      },
    },
    ...patch,
  };
  const upstream = overrides.fetch ?? (async () => providerResponse());
  const worker = createWorker({
    now,
    requestId: () => 'test-request-id',
    log: (entry) => logs.push(entry),
    ...overrides,
    fetch: async (...args) => {
      calls++;
      return upstream(...args);
    },
  });
  const request = (body: unknown = normalInput, init: RequestInit = {}) =>
    new Request('https://worker.example/analyze-notice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      ...init,
    });
  return { env, worker, request, logs, rateKeys, calls: () => calls };
}

async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const body = apiErrorSchema.parse(await response.json());
  assert.equal(body.error.code, code);
  assert.equal(body.request_id, 'test-request-id');
  return body;
}

test('Worker Web Crypto가 Node·기기용 c1 고정 벡터와 일치한다', async () => {
  assert.equal(await hashNoticeContent(hashProbe, sha256), hashProbeExpected);
});

test('정상 요청: 서버 봉투·해시·시각과 검증된 토큰별 제한 키를 반환한다', async () => {
  const h = await harness({
    fetch: async (url, init) => {
      assert.equal(
        url,
        'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
      );
      assert.equal(
        new Headers(init?.headers).get('x-goog-api-key'),
        'test-only-provider-key',
      );
      assert.equal(init?.redirect, 'manual');
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(
        body.generationConfig.responseJsonSchema,
        modelOutputSchema,
      );
      assert.equal(body.systemInstruction.parts[0].text, SYSTEM_INSTRUCTION);
      const content = JSON.parse(body.contents[0].parts[0].text);
      assert.deepEqual(Object.keys(content).sort(), [
        'attachments',
        'body_text',
        'extracted_links',
        'has_body_images',
        'published_date',
        'title',
      ]);
      assert.equal(content.published_date, normalInput.published_date);
      return providerResponse();
    },
  });
  const response = await h.worker.fetch(h.request(), h.env);
  assert.equal(response.status, 200);
  const result = analysisEnvelopeSchema.parse(await response.json());
  assert.equal(result.analyzed_at, now().toISOString());
  assert.equal(result.notice_id, normalInput.notice_id);
  assert.equal(result.content_hash, normalInput.content_hash);
  assert.equal(result.extractor_version, EXTRACTOR_VERSION);
  assert.deepEqual(result.data, normalOutput);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Request-Id'), 'test-request-id');
  assert.deepEqual(h.rateKeys, [h.env.DEMO_TOKEN_SHA256]);
  assert.equal(h.logs[0]!.total_tokens, 123);
  for (const secret of [
    token,
    h.env.GEMINI_API_KEY,
    normalInput.body_text,
    h.env.DEMO_TOKEN_SHA256,
  ])
    assert.ok(!JSON.stringify(h.logs).includes(secret));
});

test('경로·메서드·Content-Type 오류는 모델을 호출하지 않는다', async () => {
  const h = await harness();
  await expectError(
    await h.worker.fetch(new Request('https://worker.example/nope'), h.env),
    404,
    'INVALID_INPUT',
  );
  const method = await h.worker.fetch(
    new Request('https://worker.example/analyze-notice'),
    h.env,
  );
  assert.equal(method.headers.get('Allow'), 'POST');
  await expectError(method, 405, 'INVALID_INPUT');
  await expectError(
    await h.worker.fetch(
      h.request(normalInput, { headers: { 'Content-Type': 'text/plain' } }),
      h.env,
    ),
    400,
    'INVALID_INPUT',
  );
  assert.equal(h.calls(), 0);
});

test('누락·위조·만료 토큰과 잘못된 서버 토큰 설정을 거절한다', async () => {
  for (const headers of [
    { 'Content-Type': 'application/json' },
    { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
  ]) {
    const h = await harness();
    await expectError(
      await h.worker.fetch(h.request(normalInput, { headers }), h.env),
      401,
      'UNAUTHORIZED',
    );
    assert.equal(h.calls(), 0);
    assert.equal(h.rateKeys.length, 0);
  }
  for (const patch of [
    { DEMO_TOKEN_EXPIRES_AT: now().toISOString() },
    { DEMO_TOKEN_EXPIRES_AT: 'not-a-date' },
    { DEMO_TOKEN_SHA256: '' },
  ]) {
    const h = await harness({}, patch);
    await expectError(
      await h.worker.fetch(h.request(), h.env),
      401,
      'UNAUTHORIZED',
    );
    assert.equal(h.calls(), 0);
  }
});

test('중지 설정·키·모델·제한 binding 누락은 fail closed로 처리한다', async () => {
  for (const patch of [
    { ANALYSIS_ENABLED: 'false' },
    { GEMINI_API_KEY: '' },
    { GEMINI_MODEL: '' },
    { GEMINI_MODEL: '../redirect' },
  ]) {
    const h = await harness({}, patch);
    await expectError(
      await h.worker.fetch(h.request(), h.env),
      503,
      'PROVIDER_UNAVAILABLE',
    );
    assert.equal(h.calls(), 0);
  }
  const h = await harness(
    {},
    {
      ANALYZE_RATE_LIMITER: {
        async limit() {
          throw new Error('private error');
        },
      },
    },
  );
  await expectError(
    await h.worker.fetch(h.request(), h.env),
    503,
    'PROVIDER_UNAVAILABLE',
  );
  assert.equal(h.calls(), 0);
});

test('호출 제한은 429·Retry-After를 반환하며 모델을 호출하지 않는다', async () => {
  const h = await harness(
    {},
    {
      ANALYZE_RATE_LIMITER: {
        async limit() {
          return { success: false };
        },
      },
    },
  );
  const response = await h.worker.fetch(h.request(), h.env);
  assert.equal(response.headers.get('Retry-After'), '60');
  const body = await expectError(response, 429, 'RATE_LIMITED');
  assert.equal(body.error.retry_after_seconds, 60);
  assert.equal(h.calls(), 0);
});

test('실제 UTF-8 바이트 제한은 Content-Length가 없거나 작게 위조되어도 작동한다', async () => {
  for (const length of [undefined, '1']) {
    const h = await harness();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            '가'.repeat(Math.ceil(MAX_REQUEST_BYTES / 3)),
          ),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (length !== undefined) headers['Content-Length'] = length;
    const request = h.request(null, {
      body: stream,
      headers,
      duplex: 'half',
    } as RequestInit);
    await expectError(
      await h.worker.fetch(request, h.env),
      413,
      'INPUT_TOO_LARGE',
    );
    assert.equal(cancelled, true);
    assert.equal(h.calls(), 0);
  }
});

test('요청 크기 경계는 128 KiB까지 허용하고 초과를 거절한다', async () => {
  const h = await harness();
  const body = JSON.stringify(normalInput);
  const padding = MAX_REQUEST_BYTES - new TextEncoder().encode(body).length;
  assert.equal(
    (
      await h.worker.fetch(
        h.request(null, { body: body + ' '.repeat(padding) }),
        h.env,
      )
    ).status,
    200,
  );
  await expectError(
    await h.worker.fetch(
      h.request(null, { body: body + ' '.repeat(padding + 1) }),
      h.env,
    ),
    413,
    'INPUT_TOO_LARGE',
  );
  assert.equal(h.calls(), 1);
});

test('본문·링크·첨부 초과를 조용히 자르지 않는다', async () => {
  const h = await harness();
  for (const patch of [
    { body_text: '가'.repeat(20_001) },
    {
      extracted_links: Array(31).fill({
        label: '',
        url: 'https://example.invalid/',
      }),
    },
    { attachments: Array(31).fill({ name: 'a', url: null }) },
  ])
    await expectError(
      await h.worker.fetch(h.request({ ...normalInput, ...patch }), h.env),
      413,
      'INPUT_TOO_LARGE',
    );
  assert.equal(h.calls(), 0);
});

test('잘못된 JSON·UTF-8·개인정보·해시·스킴을 거절한다', async () => {
  const h = await harness();
  for (const body of ['{', new Uint8Array([0xff])])
    await expectError(
      await h.worker.fetch(h.request(null, { body }), h.env),
      400,
      'INVALID_INPUT',
    );
  for (const patch of [
    { profile: { grade: 3 } },
    { content_hash: '0'.repeat(64) },
    { source_url: 'javascript:evil()' },
    { model: 'client-chosen' },
  ]) {
    await expectError(
      await h.worker.fetch(h.request({ ...normalInput, ...patch }), h.env),
      400,
      'INVALID_INPUT',
    );
  }
  assert.equal(h.calls(), 0);
});

test('schema·extractor 불일치는 409로 반환한다', async () => {
  const h = await harness();
  for (const patch of [
    { schema_version: '1.0' },
    { extractor_version: 'unsupported' },
  ])
    await expectError(
      await h.worker.fetch(h.request({ ...normalInput, ...patch }), h.env),
      409,
      'CONTRACT_MISMATCH',
    );
  assert.equal(h.calls(), 0);
});

test('모델의 봉투 위조·불가능한 날짜·실행 스킴 URL은 성공 응답에 들어오지 않는다', async () => {
  for (const patch of [
    { notice_id: 'forged' },
    { events: [{ ...normalOutput.events[0], date: '2026-02-30' }] },
    { application_url: 'javascript:evil()' },
  ]) {
    const h = await harness({
      fetch: async () => providerResponse({ ...normalOutput, ...patch }),
    });
    await expectError(
      await h.worker.fetch(h.request(), h.env),
      502,
      'INVALID_MODEL_OUTPUT',
    );
    assert.equal(h.calls(), 1);
  }
});

test('모델 차단·잘림·빈 후보·JSON 오류·응답 크기 초과는 502이며 재호출하지 않는다', async () => {
  for (const response of [
    providerResponse(normalOutput, 'MAX_TOKENS'),
    Response.json({ candidates: [] }),
    Response.json({ promptFeedback: { blockReason: 'SAFETY' } }),
    new Response('{'),
    new Response('a'.repeat(256 * 1024 + 1)),
  ]) {
    const h = await harness({ fetch: async () => response });
    await expectError(
      await h.worker.fetch(h.request(), h.env),
      502,
      'INVALID_MODEL_OUTPUT',
    );
    assert.equal(h.calls(), 1);
  }
});

test('공급자 429·503·504·인증 오류는 공통 오류로 매핑하고 비밀 오류 본문을 버린다', async () => {
  for (const [status, expected, code] of [
    [429, 429, 'RATE_LIMITED'],
    [503, 503, 'PROVIDER_UNAVAILABLE'],
    [504, 504, 'TIMEOUT'],
    [403, 503, 'PROVIDER_UNAVAILABLE'],
  ] as const) {
    const h = await harness({
      fetch: async () =>
        new Response('private-provider-message', {
          status,
          headers: { 'Retry-After': '37' },
        }),
    });
    const response = await h.worker.fetch(h.request(), h.env);
    if (status === 429) assert.equal(response.headers.get('Retry-After'), '37');
    await expectError(response, expected, code);
    assert.equal(h.logs[0]!.provider_status, status);
    assert.equal(h.calls(), 1);
    assert.ok(!JSON.stringify(h.logs).includes('private-provider-message'));
  }
});

test('모델 요청과 응답 스트림 전체에 시간 제한을 적용한다', async () => {
  const h = await harness({
    modelTimeoutMs: 10,
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      }),
  });
  await expectError(await h.worker.fetch(h.request(), h.env), 504, 'TIMEOUT');
  assert.equal(h.calls(), 1);
  let cancelled = false;
  const slowBody = await harness({
    modelTimeoutMs: 10,
    fetch: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  await expectError(
    await slowBody.worker.fetch(slowBody.request(), slowBody.env),
    504,
    'TIMEOUT',
  );
  assert.equal(cancelled, true);
});

test('공급자 지역 제한은 분류만 로그에 남기고 원문 오류와 비밀값을 노출하지 않는다', async () => {
  const h = await harness({
    fetch: async () =>
      Response.json(
        {
          error: {
            message:
              'User location is not supported for the API use. test-only-provider-key',
          },
        },
        { status: 400 },
      ),
  });
  await expectError(
    await h.worker.fetch(h.request(), h.env),
    503,
    'PROVIDER_UNAVAILABLE',
  );
  assert.equal(h.logs[0]!.provider_status, 400);
  assert.equal(h.logs[0]!.provider_reason, 'UNSUPPORTED_LOCATION');
  assert.ok(!JSON.stringify(h.logs).includes('test-only-provider-key'));
});

test('끝나지 않는 입력 스트림을 취소하고 모델을 호출하지 않는다', async () => {
  const h = await harness({ inputTimeoutMs: 10 });
  const request = h.request(null, {
    body: new ReadableStream(),
    duplex: 'half',
  } as RequestInit);
  await expectError(await h.worker.fetch(request, h.env), 504, 'TIMEOUT');
  assert.equal(h.calls(), 0);
});
