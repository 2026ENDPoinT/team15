import { apiErrorSchema } from '../../shared/contracts';

export const rateLimitedFixture = {
  httpStatus: 429,
  headers: { 'Retry-After': '60' },
  body: apiErrorSchema.parse({
    error: { code: 'RATE_LIMITED', retryable: true, retry_after_seconds: 60 },
    request_id: 'synthetic-rate-limit-1',
  }),
};

export const invalidModelOutputFixture = {
  httpStatus: 502,
  body: apiErrorSchema.parse({
    error: {
      code: 'INVALID_MODEL_OUTPUT',
      retryable: true,
      retry_after_seconds: null,
    },
    request_id: 'synthetic-invalid-output-1',
  }),
};
