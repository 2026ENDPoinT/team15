import { randomBytes, createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const workerFile = new URL('../worker/.dev.vars', import.meta.url);
const clientFile = new URL('../.env.worker-client', import.meta.url);
if (existsSync(workerFile) || existsSync(clientFile)) {
  console.error(
    '기존 비밀 설정이 있어 덮어쓰지 않았습니다. worker/.dev.vars와 .env.worker-client를 직접 확인하세요.',
  );
  process.exitCode = 1;
} else {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  writeFileSync(
    workerFile,
    [
      '# API 키와 모델 ID를 로컬 편집기로 입력하세요. 커밋하지 않습니다.',
      'GEMINI_API_KEY=""',
      'GEMINI_MODEL="gemini-3.5-flash-lite"',
      `DEMO_TOKEN_SHA256="${hash}"`,
      `DEMO_TOKEN_EXPIRES_AT="${expiry}"`,
      '',
    ].join('\n'),
    { mode: 0o600, flag: 'wx' },
  );
  writeFileSync(
    clientFile,
    `WORKER_URL="http://127.0.0.1:8787"\nDEMO_ACCESS_TOKEN="${token}"\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    `worker/.dev.vars와 .env.worker-client를 만들었습니다. 시연 토큰 만료: ${expiry}. 비밀값은 출력하지 않습니다.`,
  );
}
