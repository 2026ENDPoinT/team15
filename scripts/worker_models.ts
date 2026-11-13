import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

try {
  const env = parseEnv(
    readFileSync(new URL('../worker/.dev.vars', import.meta.url), 'utf8'),
  );
  const key = env.GEMINI_API_KEY;
  if (!key)
    throw new Error('worker/.dev.vars의 GEMINI_API_KEY를 먼저 입력하세요.');
  let pageToken: string | undefined;
  const models: { name: string; displayName: string }[] = [];
  do {
    const url = new URL(
      'https://generativelanguage.googleapis.com/v1beta/models',
    );
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok)
      throw new Error(
        `모델 목록 조회 실패: HTTP ${response.status}. 키와 API 사용 설정을 확인하세요.`,
      );
    const result = (await response.json()) as {
      models?: {
        name: string;
        displayName: string;
        supportedGenerationMethods?: string[];
      }[];
      nextPageToken?: string;
    };
    models.push(
      ...(result.models ?? [])
        .filter((model) =>
          model.supportedGenerationMethods?.includes('generateContent'),
        )
        .map(({ name, displayName }) => ({
          name: name.replace(/^models\//, ''),
          displayName,
        })),
    );
    pageToken = result.nextPageToken;
  } while (pageToken);
  console.log(JSON.stringify(models, null, 2));
  console.log(
    '목록은 계정 호출 성공을 보장하지 않습니다. 선택한 모델 ID를 worker/.dev.vars의 GEMINI_MODEL에 넣고 worker:smoke로 검증하세요.',
  );
} catch (error) {
  console.error(
    error instanceof Error && !/fetch|network/i.test(error.message)
      ? error.message
      : '모델 목록 조회 네트워크 오류',
  );
  process.exitCode = 1;
}
