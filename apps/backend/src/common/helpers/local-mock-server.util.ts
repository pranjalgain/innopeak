import { isProduction } from '@config/deployment-target.util';
import type { EnvConfig } from '@config/env.config';

interface ConfigServiceLike {
  get: <T = string>(key: keyof EnvConfig) => T | undefined;
}

/** `apps/mock-external-apis`'s own default port — kept here, not re-derived, so this file is the
 *  one place that constant is written. */
const DEFAULT_LOCAL_MOCK_SERVER_URL = 'http://localhost:4100';

/**
 * Shared by `GoogleBusinessProfileProvider`'s write methods (`getReviewReply`/`replyToReview`) and
 * `AzureOpenAiProvider`'s client construction, so redirecting either at `apps/mock-external-apis`
 * instead of the real Google/Azure endpoint is a one-line addition per call site rather than
 * duplicated env-var logic — same shape as `getAwsEndpointOverride` for Floci. Returns `undefined`
 * outside `USE_LOCAL_MOCK_SERVER=true` (or in production, where the flag is Joi-forbidden anyway —
 * this is the same double-guard `DEV_GBP_MOCK`'s factory check already uses), which leaves each
 * provider's normal endpoint resolution (the real service) untouched.
 */
export function getLocalMockServerUrl(configService: ConfigServiceLike): string | undefined {
  if (isProduction() || configService.get<string>('USE_LOCAL_MOCK_SERVER') !== 'true') {
    return undefined;
  }
  return configService.get<string>('LOCAL_MOCK_SERVER_URL') ?? DEFAULT_LOCAL_MOCK_SERVER_URL;
}
