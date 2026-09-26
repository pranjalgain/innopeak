import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { UpdateLocaleDto } from '../../auth/dto/update-locale.dto';
import { PlatformSettingsResponseDto } from '../../settings/dto/platform-settings-response.dto';
import { AdminInviteResponseDto } from '../dto/admin-invite-response.dto';
import { AdminProfileResponseDto } from '../dto/admin-profile-response.dto';
import { ChangeAdminPasswordDto } from '../dto/change-admin-password.dto';
import { SendAdminInviteDto } from '../dto/send-admin-invite.dto';
import { SetAdminPasswordDto } from '../dto/set-admin-password.dto';
import { SetAdminStatusDto } from '../dto/set-admin-status.dto';
import { UpdateAdminLocaleResponseDto } from '../dto/update-admin-locale-response.dto';
import { UpdatePlatformSettingsDto } from '../dto/update-platform-settings.dto';

const ADMIN_PROFILE_EXAMPLE = {
  email: 'admin@innopeak.com',
  avatarUrl: null,
  locale: null,
  hasPassword: true,
};

const ADMIN_INVITE_EXAMPLE = {
  id: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
  email: 'priya.ops@innopeak.com',
  status: 'invited',
  invitedAt: '2026-03-01T09:12:00.000Z',
  expiresAt: '2026-03-08T09:12:00.000Z',
  isRoot: false,
};

export function ApiGetAdminProfile(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: "Get the signed-in platform admin's own profile" }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminProfileResponseDto,
      examples: { default: { summary: 'Admin profile', value: ADMIN_PROFILE_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiUpdateAdminLocale(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Set the language responses are rendered in',
      description:
        'Persists `platform_admins.locale`, then re-signs the access token (no refresh token to ' +
        'touch — a platform admin has none) so the new value is on its `locale` claim right ' +
        'away rather than waiting for the next login. Platform-admin tokens only.',
    }),
    ApiBody({
      type: UpdateLocaleDto,
      examples: { default: { summary: 'Typical request', value: { locale: 'de' } } },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Locale updated; a fresh access token is issued.',
      type: UpdateAdminLocaleResponseDto,
      examples: {
        default: {
          summary: 'Updated',
          value: {
            accessToken: 'eyJhbGciOiJIUzI1NiIs...',
            expiresIn: 900,
            admin: { ...ADMIN_PROFILE_EXAMPLE, locale: 'de' },
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiChangeAdminPassword(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "Change the signed-in platform admin's own password",
      description:
        'No session to revoke afterward — a platform admin has no refresh-token concept yet, so ' +
        'there is nothing else to rotate on a successful change.',
    }),
    ApiBody({
      type: ChangeAdminPasswordDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: { currentPassword: 'StrongP@ss1', newPassword: 'NewStr0ng@Pass' },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Password changed.',
      examples: {
        default: { summary: 'Password changed', value: { message: 'Password changed.' } },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'No password set on this account' }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Missing/invalid token, or the current password was wrong',
    }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiRequestAdminSetPasswordOtp(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Request the OTP required to add a first password',
      description:
        'Only for an admin with no password yet (accepted their invite via Google, or was ' +
        "seeded before this flow existed). Mailed to the account's own address — proof the " +
        'caller still controls that mailbox, since an access token alone is not enough to grant ' +
        'a passwordless account a permanent credential.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Code sent (or already has a password — same generic ack either way).',
      examples: {
        default: {
          summary: 'Acknowledged',
          value: { message: 'Verification code sent. Check your email to continue.' },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'A password is already set' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiSetAdminPassword(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "Set the signed-in platform admin's first password",
      description:
        'Requires the OTP from `POST .../set-password/request-otp`. No token to reissue ' +
        'afterward — a platform admin has no refresh token, so there is nothing else to rotate.',
    }),
    ApiBody({
      type: SetAdminPasswordDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: { newPassword: 'NewStr0ng@Pass', otp: '482913' },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Password set.',
      examples: {
        default: {
          summary: 'Password set',
          value: { message: 'Password set. You can now sign in with a password too.' },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'A password is already set, or the OTP was invalid/expired',
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiListAdminInvites(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List every platform admin, including the seeded root',
      description:
        "Despite the name, this is the full admin roster (matching the frontend's " +
        'PlatformAdminInvite[] shape), not only pending invites — each row also carries its own ' +
        'invite metadata where one exists.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: [AdminInviteResponseDto],
      examples: { default: { summary: 'Admin roster', value: [ADMIN_INVITE_EXAMPLE] } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiSendAdminInvite(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Invite a new platform admin',
      description:
        'Creates the invited admin\'s own row (status "invited", no password) and a 7-day ' +
        'invite token record. Does **not** email the invite or expose an accept-invite endpoint ' +
        'yet — that pairing is separate, comparably-sized follow-up work.',
    }),
    ApiBody({
      type: SendAdminInviteDto,
      examples: {
        default: { summary: 'Typical request', value: { email: 'priya.ops@innopeak.com' } },
      },
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      type: AdminInviteResponseDto,
      examples: { default: { summary: 'Invite created', value: ADMIN_INVITE_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'This email is already a platform admin or has a pending invite',
    })
  );
}

export function ApiRevokeAdminInvite(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Revoke a pending invite',
      description:
        "Deletes the invited admin's row outright — only while it is still `invited`. An admin " +
        'who has already accepted or been disabled cannot be revoked through this route.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Invite revoked.',
      examples: { default: { summary: 'Invite revoked', value: { message: 'Invite revoked.' } } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'No such invite, or it is no longer in the invited state',
    })
  );
}

export function ApiSetAdminStatus(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Disable or re-enable a platform admin',
      description:
        'Sets another admin `active`/`disabled`. Combined with the per-request status check in ' +
        'JwtStrategy, a disable ends the target admin’s access on their next request. Cannot ' +
        'target yourself, an invited (not-yet-accepted) admin, or the last active admin.',
    }),
    ApiBody({
      type: SetAdminStatusDto,
      examples: { default: { summary: 'Disable an admin', value: { enabled: false } } },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminInviteResponseDto,
      examples: {
        default: {
          summary: 'Admin disabled',
          value: { ...ADMIN_INVITE_EXAMPLE, status: 'disabled', expiresAt: null },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Cannot disable yourself or the last active admin',
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such admin' }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'The admin has not accepted their invite yet',
    })
  );
}

export function ApiUpdatePlatformSettings(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Update platform-wide feature settings',
      description:
        'Partial update — any field omitted is left unchanged. Controls which login methods the ' +
        'sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. ' +
        'Takes effect immediately for every visitor; no redeploy required. Rejects a patch that ' +
        'would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false, and one ' +
        'that would turn socialLoginEnabled off while a platform admin has Google as their only ' +
        'credential (an admin who accepted their invite through Google has no password, and there ' +
        'is no admin set-password flow to add one) — see the 400 response. Otherwise does not ' +
        "affect platform-admin login: a Super Admin's own password field on /login is " +
        'unconditional regardless of this setting.',
    }),
    ApiBody({
      type: UpdatePlatformSettingsDto,
      examples: {
        default: { summary: 'Enable password login', value: { passwordLoginEnabled: true } },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: PlatformSettingsResponseDto,
      examples: {
        default: {
          summary: 'Settings updated',
          value: {
            ssoLoginEnabled: true,
            passwordLoginEnabled: true,
            socialLoginEnabled: false,
            inviteMembersEnabled: false,
            paymentFeatureEnabled: false,
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description:
        'Validation failed, or the patch would leave every tenant-facing sign-in method disabled',
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}
