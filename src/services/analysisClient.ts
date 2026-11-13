import {
  analysisEnvelopeSchema,
  analyzeNoticeRequestSchema,
  apiErrorSchema,
  type AnalysisEnvelope,
  type AnalyzeNoticeRequest,
  type ApiError,
} from '../../shared/contracts';

export const WORKER_ENDPOINT =
  'https://team15-notice-ai.team15-campus-notice.workers.dev/analyze-notice';

type ErrorCode =
  | ApiError['error']['code']
  | 'NOT_CONFIGURED'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE';
const messages: Record<ErrorCode, string> = {
  NOT_CONFIGURED: '설정에서 AI 시연 토큰을 입력해 주세요.',
  UNAUTHORIZED:
    'AI 시연 토큰이 만료되었거나 올바르지 않아요. 설정에서 교체해 주세요.',
  RATE_LIMITED: '분석 요청이 많아요. 표시된 시각 이후 다시 시도해 주세요.',
  INPUT_TOO_LARGE: '분석 가능한 본문 크기를 넘었어요. 원문을 확인해 주세요.',
  INVALID_INPUT: '이 공지는 자동 분석할 수 없어요. 원문을 확인해 주세요.',
  CONTRACT_MISMATCH: '분석 버전이 맞지 않아요. 앱 설정을 확인해 주세요.',
  INVALID_MODEL_OUTPUT: '분석 결과를 확인하지 못했어요. 원문을 확인해 주세요.',
  PROVIDER_UNAVAILABLE:
    'AI 분석 서버를 사용할 수 없어요. 나중에 다시 시도해 주세요.',
  TIMEOUT: '분석 응답 시간이 초과되었어요. 나중에 다시 시도해 주세요.',
  NETWORK_ERROR:
    '분석 서버에 연결하지 못했어요. 저장한 공지는 계속 사용할 수 있어요.',
  INVALID_RESPONSE: '공지와 일치하는 분석 결과를 받지 못했어요.',
};

export class AnalysisClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(messages[code]);
    this.name = 'AnalysisClientError';
  }
}

export function validateDemoToken(value: string): string {
  const token = value.trim();
  if (!/^[A-Za-z0-9._~+-]{16,512}$/.test(token)) {
    throw new Error('시연 토큰 형식을 확인해 주세요.');
  }
  return token;
}

export function createAnalysisClient(options: {
  getToken: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  endpoint?: string;
  timeoutMs?: number;
  now?: () => Date;
}) {
  const endpoint = new URL(options.endpoint ?? WORKER_ENDPOINT);
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error('AI 서버는 인증 정보가 없는 HTTPS 주소여야 합니다.');
  }
  return async function analyze(
    input: AnalyzeNoticeRequest,
  ): Promise<AnalysisEnvelope> {
    const parsed = analyzeNoticeRequestSchema.safeParse(input);
    if (!parsed.success) throw new AnalysisClientError('INVALID_INPUT');
    const token = await options.getToken();
    if (!token) throw new AnalysisClientError('NOT_CONFIGURED');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await (options.fetch ?? globalThis.fetch)(
            endpoint.href,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(parsed.data),
              signal: controller.signal,
              redirect: 'error',
            },
          );
          const text = await response.text();
          let body: unknown;
          if (text.length <= 262_144) {
            try {
              body = JSON.parse(text);
            } catch {
              /* Reject malformed success bodies below. */
            }
          }
          if (!response.ok) {
            const error = apiErrorSchema.safeParse(body).data;
            const code =
              response.status === 401
                ? 'UNAUTHORIZED'
                : response.status === 429
                  ? 'RATE_LIMITED'
                  : (error?.error.code ?? 'PROVIDER_UNAVAILABLE');
            let retry = error?.error.retry_after_seconds ?? null;
            if (code === 'RATE_LIMITED') {
              const header = response.headers.get('Retry-After');
              const seconds =
                header && /^\d+$/.test(header)
                  ? Number(header)
                  : header
                    ? (Date.parse(header) -
                        (options.now?.() ?? new Date()).getTime()) /
                      1000
                    : NaN;
              retry = Math.max(
                1,
                Math.ceil(
                  Math.max(Number.isFinite(seconds) ? seconds : 0, retry ?? 60),
                ),
              );
            }
            throw new AnalysisClientError(code, retry);
          }
          const envelope = analysisEnvelopeSchema.safeParse(body).data;
          if (
            !envelope ||
            envelope.notice_id !== input.notice_id ||
            envelope.content_hash !== input.content_hash ||
            envelope.schema_version !== input.schema_version ||
            envelope.extractor_version !== input.extractor_version
          ) {
            throw new AnalysisClientError('INVALID_RESPONSE');
          }
          return envelope;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new AnalysisClientError('TIMEOUT'));
            controller.abort();
          }, options.timeoutMs ?? 35_000);
        }),
      ]);
    } catch (error) {
      if (error instanceof AnalysisClientError) throw error;
      throw new AnalysisClientError('NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  };
}
