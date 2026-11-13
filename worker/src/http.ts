import type { ApiError } from '../../shared/contracts';

type ErrorCode = ApiError['error']['code'];
const errorSettings: Record<ErrorCode, [number, boolean]> = {
  INVALID_INPUT: [400, false],
  INPUT_TOO_LARGE: [413, false],
  UNAUTHORIZED: [401, false],
  CONTRACT_MISMATCH: [409, false],
  RATE_LIMITED: [429, true],
  INVALID_MODEL_OUTPUT: [502, true],
  PROVIDER_UNAVAILABLE: [503, true],
  TIMEOUT: [504, true],
};

export class ApiFailure extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly retryAfter: number | null = null,
    readonly status = errorSettings[code][0],
    readonly providerStatus: number | null = null,
    readonly providerReason: string | null = null,
  ) {
    super(code);
  }
}

export function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function failureResponse(
  error: ApiFailure,
  requestId: string,
): Response {
  const body: ApiError = {
    error: {
      code: error.code,
      retryable: errorSettings[error.code][1],
      retry_after_seconds: error.retryAfter,
    },
    request_id: requestId,
  };
  const response = jsonResponse(body, error.status);
  if (error.retryAfter !== null) {
    response.headers.set('Retry-After', String(error.retryAfter));
  }
  if (error.status === 405) response.headers.set('Allow', 'POST');
  return response;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

// Content-Length 없이 chunked 요청이 와도 실제 바이트 수를 제한한다.
export async function readLimitedText(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  tooLarge: ErrorCode,
  signal: AbortSignal,
): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        cancel();
        throw new ApiFailure(tooLarge);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
