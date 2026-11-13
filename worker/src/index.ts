import {
  analysisEnvelopeSchema,
  analyzeNoticeRequestSchema,
  EXTRACTOR_VERSION,
  MAX_ATTACHMENTS,
  MAX_BODY_CHARACTERS,
  MAX_LINKS,
  MAX_REQUEST_BYTES,
  SCHEMA_VERSION,
} from '../../shared/contracts';
import { hashNoticeContent } from '../../shared/canonicalize';
import { analyzeNotice } from './analyze';
import {
  ApiFailure,
  failureResponse,
  jsonResponse,
  readLimitedText,
  sha256,
} from './http';
import type { RequestLog, WorkerDependencies, WorkerEnv } from './types';

async function authenticate(
  request: Request,
  env: WorkerEnv,
  now: Date,
): Promise<string> {
  const match = /^Bearer ([^\s]{1,512})$/i.exec(
    request.headers.get('Authorization') ?? '',
  );
  const expiresAt = Date.parse(env.DEMO_TOKEN_EXPIRES_AT);
  if (
    !match ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now.getTime() ||
    !/^[a-f0-9]{64}$/.test(env.DEMO_TOKEN_SHA256 ?? '')
  )
    throw new ApiFailure('UNAUTHORIZED');
  const hash = await sha256(match[1]!);
  let different = 0;
  for (let index = 0; index < hash.length; index++) {
    different |=
      hash.charCodeAt(index) ^ env.DEMO_TOKEN_SHA256.charCodeAt(index);
  }
  if (different !== 0) throw new ApiFailure('UNAUTHORIZED');
  return hash;
}

function parseInput(value: unknown) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ApiFailure('INVALID_INPUT');
  const input = value as Record<string, unknown>;
  if (
    (typeof input.body_text === 'string' &&
      input.body_text.length > MAX_BODY_CHARACTERS) ||
    (Array.isArray(input.extracted_links) &&
      input.extracted_links.length > MAX_LINKS) ||
    (Array.isArray(input.attachments) &&
      input.attachments.length > MAX_ATTACHMENTS)
  )
    throw new ApiFailure('INPUT_TOO_LARGE');
  if (
    (input.schema_version !== undefined &&
      input.schema_version !== SCHEMA_VERSION) ||
    (input.extractor_version !== undefined &&
      input.extractor_version !== EXTRACTOR_VERSION)
  )
    throw new ApiFailure('CONTRACT_MISMATCH');
  const parsed = analyzeNoticeRequestSchema.safeParse(input);
  if (!parsed.success) throw new ApiFailure('INVALID_INPUT');
  return parsed.data;
}

export function createWorker(overrides: Partial<WorkerDependencies> = {}) {
  const deps: WorkerDependencies = {
    fetch: globalThis.fetch.bind(globalThis),
    now: () => new Date(),
    requestId: () => crypto.randomUUID(),
    log: (entry) => console.log(JSON.stringify(entry)),
    modelTimeoutMs: 25_000,
    inputTimeoutMs: 5_000,
    ...overrides,
  };
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const start = deps.now().getTime();
      const requestId = deps.requestId();
      const log: RequestLog = {
        request_id: requestId,
        notice_id: null,
        status: 503,
        code: null,
        latency_ms: 0,
        total_tokens: null,
        provider_status: null,
        provider_reason: null,
      };
      let response: Response;
      try {
        if (new URL(request.url).pathname !== '/analyze-notice')
          throw new ApiFailure('INVALID_INPUT', null, 404);
        if (request.method !== 'POST')
          throw new ApiFailure('INVALID_INPUT', null, 405);
        if (
          request.headers
            .get('Content-Type')
            ?.split(';')[0]
            ?.trim()
            .toLowerCase() !== 'application/json'
        )
          throw new ApiFailure('INVALID_INPUT');
        const tokenId = await authenticate(request, env, deps.now());
        if (
          env.ANALYSIS_ENABLED !== 'true' ||
          !env.GEMINI_API_KEY?.trim() ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(env.GEMINI_MODEL ?? '') ||
          !env.ANALYZE_RATE_LIMITER
        )
          throw new ApiFailure('PROVIDER_UNAVAILABLE');
        if (!(await env.ANALYZE_RATE_LIMITER.limit({ key: tokenId })).success)
          throw new ApiFailure('RATE_LIMITED', 60);
        const length = request.headers.get('Content-Length');
        if (length !== null && Number(length) > MAX_REQUEST_BYTES)
          throw new ApiFailure('INPUT_TOO_LARGE');
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          deps.inputTimeoutMs,
        );
        let raw: unknown;
        try {
          raw = JSON.parse(
            await readLimitedText(
              request.body,
              MAX_REQUEST_BYTES,
              'INPUT_TOO_LARGE',
              controller.signal,
            ),
          );
        } catch (error) {
          if (controller.signal.aborted) throw new ApiFailure('TIMEOUT');
          if (error instanceof ApiFailure) throw error;
          throw new ApiFailure('INVALID_INPUT');
        } finally {
          clearTimeout(timeout);
        }
        const input = parseInput(raw);
        log.notice_id = input.notice_id.slice(0, 200);
        if ((await hashNoticeContent(input, sha256)) !== input.content_hash)
          throw new ApiFailure('INVALID_INPUT');
        const result = await analyzeNotice(input, env, deps);
        log.total_tokens = result.totalTokens;
        const envelope = analysisEnvelopeSchema.parse({
          notice_id: input.notice_id,
          content_hash: input.content_hash,
          schema_version: SCHEMA_VERSION,
          extractor_version: EXTRACTOR_VERSION,
          analyzed_at: deps.now().toISOString(),
          data: result.data,
        });
        response = jsonResponse(envelope);
      } catch (error) {
        const failure =
          error instanceof ApiFailure
            ? error
            : new ApiFailure('PROVIDER_UNAVAILABLE');
        log.code = failure.code;
        log.provider_status = failure.providerStatus;
        log.provider_reason = failure.providerReason;
        response = failureResponse(failure, requestId);
      }
      response.headers.set('X-Request-Id', requestId);
      log.status = response.status;
      log.latency_ms = Math.max(0, deps.now().getTime() - start);
      deps.log(log);
      return response;
    },
  };
}

export default createWorker();
