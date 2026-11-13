import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { apiErrorSchema } from '../shared/contracts';

// 배포된 시연 토큰의 만료를 잠깐 과거로 바꾼 뒤 반드시 원래 값으로 복원한다.
// 유효한 분석 요청을 보내지 않으므로 Gemini 호출은 발생하지 않는다.
const root = new URL('../', import.meta.url);
function setExpiry(value: string) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js', root)),
      'secret',
      'put',
      'DEMO_TOKEN_EXPIRES_AT',
      '--config',
      'worker/wrangler.jsonc',
    ],
    {
      cwd: fileURLToPath(root),
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  if (result.status !== 0)
    throw new Error(
      '만료 설정 변경 실패. worker:secrets로 정상 만료 시각을 복원하세요.',
    );
}

try {
  const server = parseEnv(
    readFileSync(new URL('worker/.dev.vars', root), 'utf8'),
  );
  const client = parseEnv(
    readFileSync(new URL('.env.worker-client', root), 'utf8'),
  );
  const expiry = server.DEMO_TOKEN_EXPIRES_AT;
  if (
    !expiry ||
    !(Date.parse(expiry) > Date.now()) ||
    !client.DEMO_ACCESS_TOKEN
  )
    throw new Error('유효한 로컬 토큰·미래 만료 시각이 필요합니다.');
  const url = new URL('/analyze-notice', client.WORKER_URL);
  if (url.protocol !== 'https:')
    throw new Error('배포된 HTTPS Worker에서만 실행하세요.');
  const probe = async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${client.DEMO_ACCESS_TOKEN}`,
      },
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    const body = apiErrorSchema.parse(await response.json());
    return { status: response.status, code: body.error.code };
  };
  const before = await probe();
  assert.ok(
    [400, 429].includes(before.status),
    '유효 토큰으로 먼저 인증을 통과해야 합니다.',
  );
  // Secret 배포의 전파가 끝나기 전에는 이전 버전이 잠깐 응답할 수 있다.
  const waitForStatus = async (statuses: number[]) => {
    for (let attempt = 0; attempt < 25; attempt++) {
      const result = await probe();
      if (statuses.includes(result.status)) return result;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Secret 배포 전파를 제한 시간 안에 확인하지 못했습니다.');
  };
  let expired;
  let restored;
  try {
    setExpiry('2000-01-01T00:00:00.000Z');
    expired = await waitForStatus([401]);
    assert.equal(expired.status, 401);
    assert.equal(expired.code, 'UNAUTHORIZED');
  } finally {
    setExpiry(expiry);
    restored = await waitForStatus([400, 429]);
  }
  assert.ok(
    [400, 429].includes(restored.status),
    '만료 시각 복원 뒤 인증 통과를 확인해야 합니다.',
  );
  const evidence = {
    verified_at: new Date().toISOString(),
    worker_url: url.origin,
    before,
    expired,
    restored,
    restored_expires_at: expiry,
    provider_calls: 0,
  };
  const directory = new URL('dist/worker-smoke/', root);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    new URL('expiry.json', directory),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : '배포 토큰 만료 검증 실패',
  );
  process.exitCode = 1;
}
