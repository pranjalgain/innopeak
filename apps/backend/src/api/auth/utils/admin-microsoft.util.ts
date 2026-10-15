import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

/** The directory platform admins may sign in from, or `undefined` while admin Microsoft sign-in is off. */
export function getAdminMicrosoftTenantId(
  configService: ConfigService<EnvConfig>
): string | undefined {
  const tenantId = configService.get<string>('ADMIN_MICROSOFT_TENANT_ID');
  return tenantId !== undefined && tenantId !== '' ? tenantId.toLowerCase() : undefined;
}

/**
 * Admin Microsoft sign-in needs the Microsoft client *and* a pinned directory. Derived from the environment alone so
 * the public platform-config can answer it without reaching into the auth module; there is no stored copy.
 */
export function isAdminMicrosoftLoginAvailable(configService: ConfigService<EnvConfig>): boolean {
  return (
    getAdminMicrosoftTenantId(configService) !== undefined &&
    (configService.get<string>('MICROSOFT_CLIENT_ID') ?? '') !== '' &&
    (configService.get<string>('MICROSOFT_CLIENT_SECRET') ?? '') !== '' &&
    (configService.get<string>('MICROSOFT_CALLBACK_URL') ?? '') !== ''
  );
}
