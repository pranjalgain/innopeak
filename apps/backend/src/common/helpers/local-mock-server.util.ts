import { isProduction } from '@config/deployment-target.util';
import type { EnvConfig } from '@config/env.config';

interface ConfigServiceLike {
  get: <T = string>(key: keyof EnvConfig) => T | undefined;
}

/** Default port of `apps/mock-external-apis`; defined only here. */
const DEFAULT_LOCAL_MOCK_SERVER_URL = 'http://localhost:4100';

/**
 * `undefined` outside `USE_LOCAL_MOCK_SERVER=true` (or in production, where the flag is Joi-forbidden anyway),
 * leaving the real endpoint untouched. Same shape as `getAwsEndpointOverride`.
 */
export function getLocalMockServerUrl(configService: ConfigServiceLike): string | undefined {
  if (isProduction() || configService.get<string>('USE_LOCAL_MOCK_SERVER') !== 'true') {
    return undefined;
  }
  return configService.get<string>('LOCAL_MOCK_SERVER_URL') ?? DEFAULT_LOCAL_MOCK_SERVER_URL;
}
