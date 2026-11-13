import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// 명령행 인자·임시 JSON·표준 출력에 비밀값을 넣지 않고 Wrangler stdin으로 전달한다.
try {
  const env = parseEnv(
    readFileSync(new URL('../worker/.dev.vars', import.meta.url), 'utf8'),
  );
  if (
    !env.GEMINI_API_KEY?.trim() ||
    !/^[a-f0-9]{64}$/.test(env.DEMO_TOKEN_SHA256 ?? '') ||
    !(Date.parse(env.DEMO_TOKEN_EXPIRES_AT ?? '') > Date.now())
  ) {
    throw new Error(
      'worker/.dev.vars에 API 키·유효한 토큰 해시·미래의 만료 시각을 먼저 설정하세요.',
    );
  }
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
      ),
      'secret',
      'bulk',
      '--config',
      'worker/wrangler.jsonc',
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      input: JSON.stringify({
        GEMINI_API_KEY: env.GEMINI_API_KEY,
        DEMO_TOKEN_SHA256: env.DEMO_TOKEN_SHA256,
        DEMO_TOKEN_EXPIRES_AT: env.DEMO_TOKEN_EXPIRES_AT,
      }),
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  if (result.error)
    throw new Error(
      'Wrangler 실행 실패. npm ci와 Cloudflare 로그인을 확인하세요.',
    );
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Worker 비밀 설정 업로드 실패',
  );
  process.exitCode = 1;
}
