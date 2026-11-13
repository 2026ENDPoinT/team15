import {
  analysisEnvelopeSchema,
  type AnalyzeNoticeRequest,
  type AnalysisEnvelope,
} from '../../shared/contracts';
import { analyzeNotice } from './analyze';
import { ApiFailure, sha256 } from './http';
import { analysisInstruction, modelOutputSchema } from './prompt';
import type { WorkerDependencies, WorkerEnv } from './types';

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Include every input (especially published_date, which content_hash excludes),
// model and prompt so changed extraction behavior cannot reuse an old result.
export function analysisCacheKey(input: AnalyzeNoticeRequest, model: string) {
  return sha256(
    JSON.stringify([
      1,
      input,
      model,
      analysisInstruction(!!input.attachment_texts?.length),
      modelOutputSchema,
    ]),
  );
}

export async function generateAnalysis(
  input: AnalyzeNoticeRequest,
  tokenId: string,
  env: WorkerEnv,
  deps: WorkerDependencies,
) {
  if (!(await env.ANALYZE_RATE_LIMITER.limit({ key: tokenId })).success)
    throw new ApiFailure('RATE_LIMITED', 60);
  const result = await analyzeNotice(input, env, deps);
  return {
    envelope: analysisEnvelopeSchema.parse({
      notice_id: input.notice_id,
      content_hash: input.content_hash,
      schema_version: input.schema_version,
      extractor_version: input.extractor_version,
      analyzed_at: deps.now().toISOString(),
      data: result.data,
    }),
    totalTokens: result.totalTokens,
  };
}

interface CacheState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    setAlarm(time: number): Promise<void>;
    deleteAll(): Promise<void>;
  };
}

interface CacheEntry {
  expiresAt: number;
  envelope: AnalysisEnvelope;
}

// One globally addressed object per cache key. The promise covers both storage
// lookup and generation so concurrent devices share one provider request.
export class AnalysisCache {
  private pending: ReturnType<typeof generateAnalysis> | undefined;
  private readonly deps: WorkerDependencies;

  constructor(
    private readonly state: CacheState,
    private readonly env: WorkerEnv,
  ) {
    this.deps = {
      fetch: globalThis.fetch.bind(globalThis),
      now: () => new Date(),
      requestId: () => crypto.randomUUID(),
      log: () => {},
      modelTimeoutMs: 25_000,
      inputTimeoutMs: 5_000,
    };
  }

  async fetch(request: Request): Promise<Response> {
    try {
      // Only reachable through the authenticated, validated Worker binding.
      const { input, tokenId } = (await request.json()) as {
        input: AnalyzeNoticeRequest;
        tokenId: string;
      };
      const shared = this.pending !== undefined;
      const pending = this.pending ?? this.loadOrGenerate(input, tokenId);
      this.pending = pending;
      try {
        const result = await pending;
        return Response.json({
          ...result,
          totalTokens: shared ? null : result.totalTokens,
        });
      } finally {
        if (this.pending === pending) this.pending = undefined;
      }
    } catch (error) {
      const failure =
        error instanceof ApiFailure
          ? error
          : new ApiFailure('PROVIDER_UNAVAILABLE');
      // Internal protocol only; outer Worker generates a fresh public request ID.
      return Response.json(
        {
          code: failure.code,
          retryAfter: failure.retryAfter,
          providerStatus: failure.providerStatus,
          providerReason: failure.providerReason,
        },
        { status: failure.status },
      );
    }
  }

  private async loadOrGenerate(input: AnalyzeNoticeRequest, tokenId: string) {
    const entry = await this.state.storage.get<CacheEntry>('analysis');
    if (entry && entry.expiresAt > this.deps.now().getTime()) {
      return {
        envelope: analysisEnvelopeSchema.parse(entry.envelope),
        totalTokens: null,
      };
    }
    const result = await generateAnalysis(input, tokenId, this.env, this.deps);
    const expiresAt = this.deps.now().getTime() + CACHE_TTL_MS;
    // Schedule cleanup first, so a failed write never leaves unbounded storage.
    await this.state.storage.setAlarm(expiresAt);
    await this.state.storage.put('analysis', {
      expiresAt,
      envelope: result.envelope,
    });
    return result;
  }

  async alarm() {
    const entry = await this.state.storage.get<CacheEntry>('analysis');
    if (entry && entry.expiresAt > this.deps.now().getTime()) {
      await this.state.storage.setAlarm(entry.expiresAt);
    } else {
      await this.state.storage.deleteAll();
    }
  }
}
