import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdatePlatformSettingsDto } from './update-platform-settings.dto';

/** Same steps as the global `ValidationPipe` (implicit conversion, whitelist, forbidNonWhitelisted). */
async function errorsFor(body: Record<string, unknown>) {
  const instance = plainToInstance(UpdatePlatformSettingsDto, body, {
    enableImplicitConversion: true,
  });
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('UpdatePlatformSettingsDto', () => {
  it('leaves an omitted field alone', async () => {
    expect(await errorsFor({ microsoftLoginEnabled: true })).toEqual([]);
  });

  it.each([
    'microsoftLoginEnabled',
    'passwordLoginEnabled',
    'googleLoginEnabled',
    'inviteMembersEnabled',
  ])(
    'rejects an explicit null for %s instead of letting it reach the UPDATE as a NOT NULL violation',
    async field => {
      const errors = await errorsFor({ [field]: null });
      expect(errors.map(e => e.property)).toContain(field);
    }
  );
});
