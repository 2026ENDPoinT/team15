import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalNoticeFixture } from '../fixtures/synthetic/notices';
import {
  AnalysisClientError,
  createAnalysisClient,
} from '../src/services/analysisClient';

const { request, analysis } = normalNoticeFixture;
const token = 'test-only-device-token';
test('모바일 클라이언트는 프로필 없이 요청하고 ID·해시·버전이 일치하는 응답만 반환한다', async () => {
  const client = createAnalysisClient({
    getToken: async () => token,
    fetch: async (_url, init) => {
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        `Bearer ${token}`,
      );
      assert.deepEqual(JSON.parse(String(init?.body)), request);
      assert.equal(init?.redirect, 'error');
      return Response.json(analysis);
    },
  });
  assert.deepEqual(await client(request), analysis);
  for (const patch of [
    { notice_id: 'other' },
    { content_hash: 'a'.repeat(64) },
    { extractor_version: 'unsupported' },
    { schema_version: '1.0' },
  ]) {
    const mismatch = createAnalysisClient({
      getToken: async () => token,
      fetch: async () => Response.json({ ...analysis, ...patch }),
    });
    await assert.rejects(
      mismatch(request),
      (error) =>
        error instanceof AnalysisClientError &&
        error.code === 'INVALID_RESPONSE',
    );
  }
});

test('토큰 누락은 요청하지 않고 인증 오류 본문과 네트워크 오류에 비밀값을 노출하지 않는다', async () => {
  let calls = 0;
  const client = createAnalysisClient({
    getToken: async () => null,
    fetch: async () => {
      calls++;
      throw new Error(token);
    },
  });
  await assert.rejects(client(request), /설정에서/);
  assert.equal(calls, 0);
  for (const fetch of [
    async () => new Response(token, { status: 401 }),
    async () => {
      throw new Error(token);
    },
  ]) {
    await assert.rejects(
      createAnalysisClient({ getToken: async () => token, fetch })(request),
      (error) =>
        error instanceof AnalysisClientError && !error.message.includes(token),
    );
  }
});

test('429는 잘못된 JSON이어도 Retry-After를 보존하고 자동 재시도하지 않는다', async () => {
  let calls = 0;
  const client = createAnalysisClient({
    getToken: async () => token,
    fetch: async () => {
      calls++;
      return new Response('busy', {
        status: 429,
        headers: { 'Retry-After': '120' },
      });
    },
  });
  await assert.rejects(
    client(request),
    (error) =>
      error instanceof AnalysisClientError &&
      error.code === 'RATE_LIMITED' &&
      error.retryAfterSeconds === 120,
  );
  assert.equal(calls, 1);
});

test('요청과 응답 본문 읽기를 함께 제한하고 늦은 응답을 반환하지 않는다', async () => {
  let signal: AbortSignal | null | undefined;
  const client = createAnalysisClient({
    getToken: async () => token,
    timeoutMs: 10,
    fetch: async (_url, init) => {
      signal = init?.signal;
      return { ok: true, text: () => new Promise(() => {}) } as Response;
    },
  });
  await assert.rejects(
    client(request),
    (error) => error instanceof AnalysisClientError && error.code === 'TIMEOUT',
  );
  assert.equal(signal?.aborted, true);
});
