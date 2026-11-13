export interface WorkerEnv {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  DEMO_TOKEN_SHA256: string;
  DEMO_TOKEN_EXPIRES_AT: string;
  ANALYSIS_ENABLED: string;
  ANALYZE_RATE_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

export interface RequestLog {
  request_id: string;
  notice_id: string | null;
  status: number;
  code: string | null;
  latency_ms: number;
  total_tokens: number | null;
  provider_status: number | null;
  provider_reason: string | null;
}

export interface WorkerDependencies {
  fetch: typeof fetch;
  now: () => Date;
  requestId: () => string;
  log: (entry: RequestLog) => void;
  modelTimeoutMs: number;
  inputTimeoutMs: number;
}
