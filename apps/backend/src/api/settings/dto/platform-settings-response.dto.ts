import type { PlatformSettingsRow } from '@db/repositories/platform-settings/types/platform-settings.type';
import { ApiProperty } from '@nestjs/swagger';

/** The settings that come from the deploy's environment rather than the `platform_settings` row. */
export interface PlatformDeploySettings {
  paymentFeatureEnabled: boolean;
  erasureGracePeriodDays: number;
  adminMicrosoftLoginAvailable: boolean;
  adminGoogleLoginAvailable: boolean;
}

export class PlatformSettingsResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the sign-in/sign-up screens offer the Microsoft SSO button.',
  })
  microsoftLoginEnabled!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether the sign-in/sign-up screens offer email/password.',
  })
  passwordLoginEnabled!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether the sign-in/sign-up screens offer Google social sign-in.',
  })
  googleLoginEnabled!: boolean;

  @ApiProperty({
    example: false,
    description: "Whether a tenant owner's Settings > Members tab can send invites.",
  })
  inviteMembersEnabled!: boolean;

  @ApiProperty({
    example: false,
    description:
      "Whether a tenant's Settings screen offers notification channel preferences (the Notifications tab). " +
      'Off by default: phase one delivers in-app notifications only, which need no preferences.',
  })
  notificationSettingsEnabled!: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether billing exists in this deploy at all — new sign-ups get a Paid plan option, ' +
      'admins see the Billing dashboard, and Checkout/the Customer Portal are reachable. A pure ' +
      "reflection of the deploy-level PAYMENT_FEATURE_ENABLED env var (env.config.ts's own doc " +
      'comment explains why there is deliberately no second, runtime-toggleable copy of this) — ' +
      'not stored on `platform_settings` and not writable through this API.',
  })
  paymentFeatureEnabled!: boolean;

  @ApiProperty({
    example: 21,
    description:
      'Days between a business being scheduled for erasure and its data actually being erased — ' +
      'the deploy-level ERASURE_GRACE_PERIOD_DAYS env var, not stored on `platform_settings` and ' +
      'not writable through this API. The web app shows deadlines ("takes effect on …") computed ' +
      'from it, so they match the nightly purge.',
  })
  erasureGracePeriodDays!: number;

  @ApiProperty({
    example: true,
    description:
      'Whether the admin sign-in page offers "Continue with Microsoft": the Microsoft client is ' +
      'configured and `ADMIN_MICROSOFT_TENANT_ID` pins the directory admins sign in from. A pure reflection of ' +
      'the deploy environment, not stored on `platform_settings` and not writable through this API; ' +
      'independent of `microsoftLoginEnabled`, which governs tenant sign-in only.',
  })
  adminMicrosoftLoginAvailable!: boolean;

  @ApiProperty({
    example: true,
    description:
      'Whether the admin sign-in page offers "Continue with Google": the Google OAuth client is configured on this deploy. ' +
      'Independent of `googleLoginEnabled`, which governs tenant sign-in only (an admin who accepted an invite with Google has ' +
      'no password, so the switch must not take their way in away); a pure reflection of the environment, not writable.',
  })
  adminGoogleLoginAvailable!: boolean;

  static from(
    row: PlatformSettingsRow,
    deploy: PlatformDeploySettings
  ): PlatformSettingsResponseDto {
    const dto = new PlatformSettingsResponseDto();
    dto.microsoftLoginEnabled = row.microsoftLoginEnabled;
    dto.passwordLoginEnabled = row.passwordLoginEnabled;
    dto.googleLoginEnabled = row.googleLoginEnabled;
    dto.inviteMembersEnabled = row.inviteMembersEnabled;
    dto.notificationSettingsEnabled = row.notificationSettingsEnabled;
    dto.paymentFeatureEnabled = deploy.paymentFeatureEnabled;
    dto.erasureGracePeriodDays = deploy.erasureGracePeriodDays;
    dto.adminMicrosoftLoginAvailable = deploy.adminMicrosoftLoginAvailable;
    dto.adminGoogleLoginAvailable = deploy.adminGoogleLoginAvailable;
    return dto;
  }
}
