import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

import { AcceptAdminInviteDto } from '../dto/accept-admin-invite.dto';
import { AdminInvitePreviewDto } from '../dto/admin-invite-preview.dto';
import { LoginDto } from '../dto/login.dto';

export function ApiAdminLogin(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Platform-admin password login',
      description:
        'Its own route, not the shared tenant `POST /v1/auth/login` — queries `platform_admins` ' +
        'directly, with nothing left to disambiguate (see `separate-admin-login-design.md`). ' +
        'Only the `admin_access_token` cookie is set — see `TokenService.signPlatformAdminAccessToken` ' +
        'for why this principal type has no refresh token.',
    }),
    ApiBody({
      type: LoginDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: { email: 'admin@innopeak.com', password: 'StrongP@ss1' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Admin session issued.',
      examples: {
        default: {
          summary: 'Signed in',
          value: {
            accessToken: 'eyJhbGciOiJIUzI1NiIs...',
            expiresIn: 900,
            admin: { id: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f', email: 'admin@innopeak.com' },
          },
        },
      },
    }),
    ApiResponse({
      status: 401,
      description:
        'Wrong password, unknown email, an `invited` admin who has not accepted yet (no ' +
        'password to check), or the account is temporarily locked out after too many failed ' +
        'attempts — the same message for all four.',
      examples: {
        default: {
          summary: 'Invalid credentials',
          value: {
            statusCode: 401,
            status: 'Failure',
            message: 'Invalid email or password.',
            error: 'Unauthorized',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    }),
    ApiResponse({ status: 403, description: 'ACCOUNT_DISABLED.' })
  );
}

export function ApiValidateAdminInvite(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Preview a platform-admin invite',
      description:
        'Lets the accept screen show "You\'ve been invited as `<email>`" before asking for a ' +
        'password, without spending the token — read-only, does not set `used_at`. Same check ' +
        '`POST /v1/admin/auth/invite/accept` and the Google authorize route below apply: ' +
        "`purpose = 'invite'`, unused, unexpired.",
    }),
    ApiParam({ name: 'token', description: 'The raw invite token from the accept-invite link' }),
    ApiResponse({
      status: 200,
      type: AdminInvitePreviewDto,
      examples: {
        default: { summary: 'Valid invite', value: { email: 'priya.ops@innopeak.com' } },
      },
    }),
    ApiResponse({
      status: 404,
      description: 'The token was never valid, already accepted, or has expired.',
      examples: {
        default: {
          summary: 'Invalid or expired',
          value: {
            statusCode: 404,
            status: 'Failure',
            message: 'This invite link is invalid or has expired.',
            error: 'Not Found',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    })
  );
}

export function ApiAcceptAdminInvite(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Accept a platform-admin invite by setting a password',
      description:
        'Sets `platform_admins.password_hash`, flips `status` `invited` -> `active`, and ' +
        'consumes the invite token — a guarded compare-and-swap (`used_at IS NULL AND ' +
        'expires_at > now()` inside the same UPDATE), so a double-submit cannot redeem the same ' +
        'token twice. Issues an admin session on success, same shape as ' +
        '`POST /v1/admin/auth/login` — only the `admin_access_token` cookie is set. See ' +
        '`GET /v1/admin/auth/invite/:token/google` for the SSO alternative.',
    }),
    ApiBody({
      type: AcceptAdminInviteDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: { token: 'kx7F2m9pQnR4vL8wZs1cYb3dEaJhTgUo', password: 'NewStr0ng@Pass' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Invite accepted; admin session issued.',
      examples: {
        default: {
          summary: 'Accepted',
          value: {
            accessToken: 'eyJhbGciOiJIUzI1NiIs...',
            expiresIn: 900,
            admin: { id: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f', email: 'priya.ops@innopeak.com' },
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description:
        'The token was never valid, already accepted, or has expired — one message for all ' +
        'three, same enumeration-avoidance reasoning as INVALID_OR_EXPIRED_OTP — or `password` ' +
        'failed complexity rules.',
      examples: {
        default: {
          summary: 'Invalid or expired',
          value: {
            statusCode: 400,
            status: 'Failure',
            message: 'This invite link is invalid or has expired.',
            error: 'Bad Request',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    })
  );
}

export function ApiAdminGoogleLogin(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Start a platform-admin Google sign-in',
      description:
        'The Google button on the admin sign-in screen. Its own route and its own ' +
        '`OAuthIntent.ADMIN_LOGIN`, not the tenant `GET /v1/auth/google`: this one resolves the ' +
        'returned identity against `platform_admin_identities` and stops there, so the admin ' +
        'screen can never hand back a tenant session, and every failure lands on ' +
        '`/admin-login?error=` rather than the tenant login page. Needed because an admin who ' +
        'accepted their invite through Google has no password at all — this is their only way ' +
        'back in. Completion happens at the shared `GET /v1/auth/google/callback`.',
    }),
    ApiResponse({
      status: 302,
      description: 'Redirect to Google, or back to /admin-login with ?error=',
    }),
    ApiResponse({ status: 503, description: 'GOOGLE_CLIENT_ID / SECRET / CALLBACK_URL unset' })
  );
}

export function ApiInviteGoogleAuthorize(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Accept a platform-admin invite via Google',
      description:
        'The SSO alternative to `POST /v1/admin/auth/invite/accept` — deliberately not the same ' +
        'route as `GET /v1/auth/google` login, since a first-time invitee has no ' +
        '`platform_admin_identities` row yet for that callback to find. Re-validates the token ' +
        '(unexpired, unused) before ever redirecting, so a dead link fails fast on this screen ' +
        'rather than after the round trip. Completion happens back at the shared ' +
        '`GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited ' +
        'address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check ' +
        "that stops someone else's Google account from redeeming this link.",
    }),
    ApiParam({ name: 'token', description: 'The raw invite token from the accept-invite link' }),
    ApiResponse({
      status: 302,
      description: 'Redirect to Google, or to the accept page with ?error=',
    }),
    ApiResponse({ status: 503, description: 'GOOGLE_CLIENT_ID / SECRET / CALLBACK_URL unset' })
  );
}
