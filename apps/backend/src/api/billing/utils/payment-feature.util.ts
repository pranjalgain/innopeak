import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

/** `PAYMENT_FEATURE_ENABLED`, the deploy-level switch for selling the Paid plan. Off unless exactly `'true'`. */
export function isPaymentFeatureEnabled(configService: ConfigService<EnvConfig>): boolean {
  return configService.get<string>('PAYMENT_FEATURE_ENABLED') === 'true';
}
