import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { analysisEnvelopeSchema, apiErrorSchema } from '../shared/contracts';
import { realNoticeInputs } from './real_notice_inputs';

try {
  const env = parseEnv(
    readFileSync(new URL('../.env.worker-client', import.meta.url), 'utf8'),
  );
  const baseUrl = new URL(env.WORKER_URL ?? 'http://127.0.0.1:8787');
  if (
    baseUrl.protocol !== 'https:' &&
    !(
      baseUrl.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(baseUrl.hostname)
    )
  )
    throw new Error('Worker 주소는 HTTPS 또는 로컬 주소여야 합니다.');
  if (!env.DEMO_ACCESS_TOKEN)
    throw new Error('worker:setup으로 로컬 시연 토큰을 먼저 준비하세요.');
  const results = [];
  for (const input of await realNoticeInputs()) {
    const response = await fetch(new URL('/analyze-notice', baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEMO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(input),
      redirect: 'error',
      signal: AbortSignal.timeout(35_000),
    });
    const raw: unknown = await response.json();
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(raw);
      throw new Error(
        `Worker HTTP ${response.status}: ${error.success ? error.data.error.code : '오류 계약 불일치'}`,
      );
    }
    const envelope = analysisEnvelopeSchema.parse(raw);
    assert.equal(envelope.notice_id, input.notice_id);
    assert.equal(envelope.content_hash, input.content_hash);
    assert.equal(envelope.schema_version, input.schema_version);
    assert.equal(envelope.extractor_version, input.extractor_version);
    // 두 실제 표본 모두 신청 마감 연도 근거가 없다. 학과 활동 연도도 불명확하다.
    assert.ok(
      envelope.data.events.every(
        (event) =>
          event.type !== 'application_close' || event.status === 'needs_review',
      ),
    );
    if (input.notice_id.startsWith('seoultech_cs:'))
      assert.ok(
        envelope.data.events.every((event) => event.status === 'needs_review'),
      );
    if (input.has_body_images || input.attachments.length > 0)
      assert.ok(envelope.data.review_notes.length > 0);
    results.push({
      source_url: input.source_url,
      request_id: response.headers.get('X-Request-Id'),
      envelope,
    });
    console.log(`${input.notice_id}: 계약·해시·연도 미확인 규칙 통과`);
  }
  const directory = new URL('../dist/worker-smoke/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    new URL('latest.json', directory),
    JSON.stringify(
      {
        verified_at: new Date().toISOString(),
        worker_url: baseUrl.origin,
        input_kind: 'captured_real_html',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    '실제 본문 응답을 dist/worker-smoke/latest.json에 저장했습니다. 의미 정확성은 원문과 추가 대조하세요.',
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Worker 실제 본문 검증 실패',
  );
  process.exitCode = 1;
}
