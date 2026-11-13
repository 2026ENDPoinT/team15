import { z } from 'zod';
import type {
  AnalyzeNoticeRequest,
  NoticeAnalysis,
} from '../../shared/contracts';
import { ApiFailure, readLimitedText } from './http';
import { modelOutputSchema, SYSTEM_INSTRUCTION } from './prompt';
import type { WorkerDependencies, WorkerEnv } from './types';
import { validateAnalysis } from './validate';

const providerResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string(),
        content: z.object({
          parts: z.array(
            z.object({
              text: z.string().optional(),
              thought: z.boolean().optional(),
            }),
          ),
        }),
      }),
    )
    .length(1),
  usageMetadata: z
    .object({ totalTokenCount: z.number().int().nonnegative().optional() })
    .optional(),
});

function retryAfterSeconds(response: Response, now: Date): number {
  const header = response.headers.get('Retry-After');
  if (header === null) return 60;
  const seconds = /^\d+$/.test(header)
    ? Number(header)
    : Math.ceil((Date.parse(header) - now.getTime()) / 1000);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : 60;
}

export async function analyzeNotice(
  input: AnalyzeNoticeRequest,
  env: WorkerEnv,
  deps: WorkerDependencies,
): Promise<{ data: NoticeAnalysis; totalTokens: number | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deps.modelTimeoutMs);
  try {
    const response = await deps.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        signal: controller.signal,
        // workerd는 follow/manual을 지원한다. 리다이렉트를 따라 키를 전달하지 않는다.
        redirect: 'manual',
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: JSON.stringify({
                    title: input.title,
                    body_text: input.body_text,
                    published_date: input.published_date ?? null,
                    extracted_links: input.extracted_links,
                    attachments: input.attachments,
                    has_body_images: input.has_body_images,
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: modelOutputSchema,
            maxOutputTokens: 8192,
            candidateCount: 1,
          },
        }),
      },
    );
    if (!response.ok) {
      // 원문 오류 본문·키는 로그에 남기지 않고 운영에 필요한 분류만 기록한다.
      let reason = 'OTHER';
      try {
        const errorText = await readLimitedText(
          response.body,
          16 * 1024,
          'PROVIDER_UNAVAILABLE',
          controller.signal,
        );
        const errorBody = JSON.parse(errorText) as {
          error?: { message?: unknown };
        };
        const message =
          typeof errorBody.error?.message === 'string'
            ? errorBody.error.message
            : '';
        if (
          /location.*(?:not supported|not available|unsupported)/i.test(message)
        )
          reason = 'UNSUPPORTED_LOCATION';
        else if (/API.?key.*(?:invalid|not valid|expired)/i.test(message))
          reason = 'INVALID_API_KEY';
        else if (/schema|generation_config|generationConfig/i.test(message))
          reason = 'INVALID_SCHEMA';
        else if (/high demand|overloaded/i.test(message))
          reason = 'HIGH_DEMAND';
      } catch {
        /* 공급자 오류 본문이 JSON이 아니어도 HTTP 상태는 보존한다. */
      }
      if (response.status === 429)
        throw new ApiFailure(
          'RATE_LIMITED',
          retryAfterSeconds(response, deps.now()),
          429,
          response.status,
          reason,
        );
      if (response.status === 408 || response.status === 504)
        throw new ApiFailure('TIMEOUT', null, 504, response.status, reason);
      throw new ApiFailure(
        'PROVIDER_UNAVAILABLE',
        null,
        503,
        response.status,
        reason,
      );
    }
    const text = await readLimitedText(
      response.body,
      256 * 1024,
      'INVALID_MODEL_OUTPUT',
      controller.signal,
    );
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiFailure('INVALID_MODEL_OUTPUT');
    }
    const parsed = providerResponseSchema.safeParse(raw);
    if (!parsed.success) throw new ApiFailure('INVALID_MODEL_OUTPUT');
    const candidate = parsed.data.candidates[0]!;
    if (candidate.finishReason !== 'STOP')
      throw new ApiFailure('INVALID_MODEL_OUTPUT');
    const outputText = candidate.content.parts
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
    let output: unknown;
    try {
      output = JSON.parse(outputText);
    } catch {
      throw new ApiFailure('INVALID_MODEL_OUTPUT');
    }
    return {
      data: validateAnalysis(input, output),
      totalTokens: parsed.data.usageMetadata?.totalTokenCount ?? null,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new ApiFailure('TIMEOUT');
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('PROVIDER_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}
