import type { EnvConfig } from '@config/env.config';
import type { EmailProvider } from '@email/providers/email.provider';
import type { ConfigService } from '@nestjs/config';

/** A setting the operator actually provided, as opposed to the default a provider falls back to. */
export function isSettingProvided(value: string | undefined): boolean {
  return (value ?? '').trim() !== '';
}

/**
 * The deploy-level master switch, `EMAIL_DELIVERY_ENABLED`. Off unless explicitly set to `true`: email delivery is not wired up in every
 * environment, and a leftover provider key must not silently make password sign-in available (a sign-up is completed by an emailed code).
 */
export function isEmailDeliveryEnabled(configService: ConfigService<EnvConfig>): boolean {
  return configService.get<string>('EMAIL_DELIVERY_ENABLED') === 'true';
}

/**
 * Whether an email sent now would reach its recipient. Email/password sign-in depends on it (a sign-up is completed by an emailed code),
 * so it decides whether that switch is in effect and whether an admin may turn it on.
 *
 * Both the deploy switch and the provider must say yes. Deliberately has no developer-machine exemption: the local provider only logs the
 * message, so nobody actually receives the code.
 */
export function canDeliverEmail(
  emailProvider: EmailProvider,
  configService: ConfigService<EnvConfig>
): boolean {
  return isEmailDeliveryEnabled(configService) && emailProvider.isConfigured();
}
