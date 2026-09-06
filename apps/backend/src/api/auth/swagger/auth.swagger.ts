import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import type { LoginPendingVerificationDto } from '../dto/login-response.dto';
import { LoginDto } from '../dto/login.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import { SignupResponseDto } from '../dto/signup-response.dto';
import { SignupDto } from '../dto/signup.dto';
import { TokenResponseDto } from '../dto/token-response.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';

const TOKEN_RESPONSE_EXAMPLE = {
  accessToken: 'eyJhbGciOiJIUzI1NiIs...',
  expiresIn: 900,
  user: {
    id: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
    tenantId: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
    name: 'Jane Doe',
    email: 'jane@thecoffeehouse.com',
    role: 'owner',
  },
  hasConnectedBusiness: false,
};

export function ApiSignup(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Owner self-registration (password path)',
      description:
        'Creates the tenant, owner, and default settings together, then emails a 6-digit ' +
        'verification code (no link — see POST /v1/auth/verify-email). Fails with 409 if this ' +
        'email is already registered, under any status or tenant. `businessName` is the ' +
        'tenant/company name — required, and distinct from a `locations.name` (the per-location ' +
        'name synced later from a connected Google Business Profile).',
    }),
    ApiBody({
      type: SignupDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: {
            businessName: 'The Coffee House',
            ownerName: 'Jane Doe',
            email: 'jane@thecoffeehouse.com',
            password: 'StrongP@ss1',
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      type: SignupResponseDto,
      examples: {
        default: {
          summary: 'New tenant',
          value: {
            tenantId: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
            userId: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
            status: 'pending_verification',
            message: 'Verification code sent to jane@thecoffeehouse.com',
          },
        },
      },
    }),
    ApiResponse({
      status: 409,
      description: 'An account with this email already exists.',
      examples: {
        default: {
          summary: 'Already registered',
          value: {
            statusCode: 409,
            status: 'Failure',
            message: 'An account with this email already exists.',
            error: 'Conflict',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Validation error',
      examples: {
        default: {
          summary: 'Weak password',
          value: {
            statusCode: 400,
            status: 'Failure',
            message:
              'password must contain an uppercase letter, a lowercase letter, a digit, and a special character',
            error: 'Validation Error',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    })
  );
}

export function ApiVerifyEmail(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Consume a signup/login verification OTP (password path only)',
      description:
        'Marks the code used, activates the user, and — since reaching this screen already ' +
        'proved the caller knows the account password (either just set at signup or just typed ' +
        'at login) — issues a token pair, same as a successful login. Same ' +
        'INVALID_OR_EXPIRED_OTP error for a code that never existed, was already used, expired, ' +
        'or belongs to an account no longer pending_verification — never distinguished (Security ' +
        'considerations). The refresh token is set as an httpOnly `refresh_token` cookie ' +
        '(scoped to `/v1/auth`), never in the JSON body — only `accessToken` is.',
    }),
    ApiBody({
      type: VerifyEmailDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: { email: 'jane@thecoffeehouse.com', otp: '482913' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Code consumed, user is now active, tokens issued.',
      type: TokenResponseDto,
      examples: { default: { summary: 'Verified', value: TOKEN_RESPONSE_EXAMPLE } },
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid, already-used, expired, or no-longer-pending code.',
      examples: {
        default: {
          summary: 'Invalid or expired code',
          value: {
            statusCode: 400,
            status: 'Failure',
            message: 'Invalid or expired verification code.',
            error: 'Bad Request',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    })
  );
}

export function ApiLogin(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Password login',
      description:
        'A still-`pending_verification` account is not an error here: credentials are checked ' +
        'first, and on success a fresh OTP is sent and a `pending_verification` result is ' +
        'returned instead of tokens — the frontend renders the same OTP stepper the signup ' +
        'wizard uses. `disabled`/`suspended` accounts still fail with 403. On the active-account ' +
        'success path, the refresh token is set as an httpOnly `refresh_token` cookie (scoped to ' +
        '`/v1/auth`), never in the JSON body.',
    }),
    ApiBody({
      type: LoginDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: { email: 'jane@thecoffeehouse.com', password: 'StrongP@ss1' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description:
        'Either a full token pair, or a pending_verification result (see LoginPendingVerificationDto).',
      type: TokenResponseDto,
      examples: {
        success: { summary: 'Active account', value: TOKEN_RESPONSE_EXAMPLE },
        pendingVerification: {
          summary: 'Still pending verification',
          value: {
            status: 'pending_verification',
            email: 'jane@thecoffeehouse.com',
            message: 'Verification code sent to jane@thecoffeehouse.com',
          } satisfies LoginPendingVerificationDto,
        },
      },
    }),
    ApiResponse({
      status: 401,
      description:
        'Wrong password, unknown email, or an SSO-only account attempting password login — one message for all three.',
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
    ApiResponse({ status: 403, description: 'ACCOUNT_DISABLED or TENANT_SUSPENDED.' })
  );
}

export function ApiRefresh(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Rotate the refresh token, mint a fresh access token',
      description:
        'No request body — the refresh token comes from the httpOnly `refresh_token` cookie ' +
        '(set by login/verify-email/a prior refresh), never from a payload a script could ' +
        'construct. Single-use rotation: the presented refresh token is revoked in the same ' +
        'call a new pair is issued (and the cookie replaced). Re-checks the owning user/tenant ' +
        'standing every time (disabled/suspended revokes every refresh token that user has). ' +
        'Not the fuller reuse-grace-window replay tolerance or token-family theft detection ' +
        'described elsewhere — a documented follow-up.',
    }),
    ApiResponse({
      status: 200,
      type: TokenResponseDto,
      examples: { default: { summary: 'Rotated', value: TOKEN_RESPONSE_EXAMPLE } },
    }),
    ApiResponse({
      status: 401,
      description: 'Missing, expired, revoked, reused, or otherwise invalid refresh token cookie.',
      examples: {
        default: {
          summary: 'Invalid refresh token',
          value: {
            statusCode: 401,
            status: 'Failure',
            message: 'Invalid or expired refresh token.',
            error: 'Unauthorized',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    })
  );
}

export function ApiLogout(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Revoke every refresh token for the current user',
      description:
        'All sessions/devices — a single-session logout is intentionally not offered separately. ' +
        'Also clears the `refresh_token` cookie for the caller.',
    }),
    ApiResponse({
      status: 200,
      examples: {
        default: {
          summary: 'Logged out',
          value: {
            statusCode: 200,
            status: 'Success',
            message: 'Logged out.',
            data: { message: 'Logged out.' },
          },
        },
      },
    })
  );
}

export function ApiResendOtp(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Resend a verification OTP',
      description:
        'The OTP stepper\'s "Resend" button — doesn\'t collect a password (unlike login), so it ' +
        'always returns the same generic acknowledgement whether or not the email matches a ' +
        'pending_verification account, same enumeration-prevention shape as forgot-password.',
    }),
    ApiBody({ type: ResendOtpDto }),
    ApiResponse({
      status: 200,
      examples: {
        default: {
          summary: 'Acknowledged',
          value: {
            statusCode: 200,
            status: 'Success',
            message: 'If this account is awaiting verification, a code has been sent.',
            data: { message: 'If this account is awaiting verification, a code has been sent.' },
          },
        },
      },
    })
  );
}
