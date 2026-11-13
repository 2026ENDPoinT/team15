import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { apiErrorSchema } from '../shared/contracts';

// 유효한 분석 입력은 보내지 않으므로 이 검증에서는 Gemini를 호출하지 않는다.
try {
  const env = parseEnv(
    readFileSync(new URL('../.env.worker-client', import.meta.url), 'utf8'),
  );
  if (!env.WORKER_URL || !env.DEMO_ACCESS_TOKEN)
    throw new Error('Worker 주소와 시연 토큰을 먼저 설정하세요.');
  const url = new URL('/analyze-notice', env.WORKER_URL);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname)
    )
  )
    throw new Error('Worker 주소는 HTTPS 또는 로컬 주소여야 합니다.');
  const send = (token?: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  for (const token of [undefined, 'invalid-test-token']) {
    const response = await send(token);
    assert.equal(response.status, 401);
    assert.equal(
      apiErrorSchema.parse(await response.json()).error.code,
      'UNAUTHORIZED',
    );
  }
  const statuses: number[] = [];
  for (let index = 0; index < 2; index++) {
    const response = await send(env.DEMO_ACCESS_TOKEN);
    const body = apiErrorSchema.parse(await response.json());
    statuses.push(response.status);
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_INPUT');
  }
  const evidence = {
    verified_at: new Date().toISOString(),
    worker_url: url.origin,
    unauthorized: [401, 401],
    invalid_input_statuses: statuses,
    rate_limit_verified: false,
    provider_calls: 0,
  };
  const directory = new URL('../dist/worker-smoke/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    new URL('access.json', directory),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Worker 접근 검증 실패',
  );
  process.exitCode = 1;
}
