import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { AuthenticatedUserDto } from '../dto/authenticated-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CompleteGoogleSignupDto } from '../dto/complete-google-signup.dto';
import type { LoginPendingVerificationDto } from '../dto/login-response.dto';
import { LoginDto } from '../dto/login.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import { SetPasswordDto } from '../dto/set-password.dto';
import { SignupResponseDto } from '../dto/signup-response.dto';
import { SignupDto } from '../dto/signup.dto';
import { TokenResponseDto } from '../dto/token-response.dto';
import { UpdateLocaleResponseDto } from '../dto/update-locale-response.dto';
import { UpdateLocaleDto } from '../dto/update-locale.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';

const TOKEN_RESPONSE_EXAMPLE = {
  accessToken: 'eyJhbGciOiJIUzI1NiIs...',
  expiresIn: 900,
  user: {
    id: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
    tenantId: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
    name: 'Jane Doe',
    email: 'jane@thecoffeehouse.com',
    role: UserRole.OWNER,
    hasPassword: true,
    businessName: 'The Coffee House',
    locale: null,
  },
  hasConnectedBusiness: false,
};

export function ApiChangePassword(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Change the current user’s password',
      description:
        'Requires the current password. Updates `users.password_hash`, revokes every refresh ' +
        'token for the user, then issues a fresh pair so this tab stays signed in. Other ' +
        'sessions die. Tenant-user tokens only. The refresh token is set as an httpOnly ' +
        '`refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.',
    }),
    ApiBody({
      type: ChangePasswordDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: { currentPassword: 'StrongP@ss1', newPassword: 'NewStr0ng@Pass' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Password updated; other sessions signed out; fresh tokens issued.',
      type: TokenResponseDto,
      examples: { default: { summary: 'Changed', value: TOKEN_RESPONSE_EXAMPLE } },
    }),
    ApiResponse({
      status: 401,
      description: 'Current password did not match, or the access token is missing/expired.',
      examples: {
        default: {
          summary: 'Wrong current password',
          value: {
            statusCode: 401,
            status: 'Failure',
            message: 'Current password is incorrect.',
            error: 'Unauthorized',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'SSO-only account (no password hash), or newPassword failed complexity rules.',
      examples: {
        noPassword: {
          summary: 'SSO-only account',
          value: {
            statusCode: 400,
            status: 'Failure',
            message:
              'This account has no password. Sign in with the identity provider used to create it.',
            error: 'Bad Request',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
      },
    }),
    ApiResponse({
      status: 403,
      description: 'Authenticated as a platform admin, not a tenant user.',
    })
  );
}

export function ApiRequestSetPasswordOtp(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Request the OTP required to set a password on a passwordless account',
      description:
        'Step-up verification ahead of POST /v1/auth/set-password: emails a 6-digit code to the ' +
        "caller's own address, proving live mailbox control rather than just possession of an " +
        'access token. Same cooldown/attempt-budget shape as the signup/login OTP. 400s if the ' +
        'account already has a password.',
    }),
    ApiResponse({
      status: 200,
      description:
        'Acknowledged — a fresh code was sent, or one is still live within its cooldown.',
      examples: {
        default: {
          summary: 'Acknowledged',
          value: {
            statusCode: 200,
            status: 'Success',
            message: 'Verification code sent. Check your email to continue.',
            data: { message: 'Verification code sent. Check your email to continue.' },
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'The account already has a password — use change-password instead.',
    })
  );
}

export function ApiSetPassword(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Set a password for an account that has never had one',
      description:
        'For a Google/SSO-only account (`users.password_hash IS NULL`) — no current password to ' +
        'prove, so unlike POST /v1/auth/change-password this takes `otp` (from ' +
        'POST /v1/auth/set-password/request-otp) instead. Revokes every refresh token for the ' +
        'user, then issues a fresh pair so this tab stays signed in. Tenant-user tokens only. ' +
        '400s if the account already has a password, or if the OTP is missing/expired/wrong — ' +
        'use change-password instead in the former case.',
    }),
    ApiBody({
      type: SetPasswordDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: { newPassword: 'NewStr0ng@Pass', otp: '482913' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Password set; other sessions signed out; fresh tokens issued.',
      type: TokenResponseDto,
      examples: { default: { summary: 'Set', value: TOKEN_RESPONSE_EXAMPLE } },
    }),
    ApiResponse({
      status: 400,
      description:
        'The account already has a password, newPassword failed complexity rules, or the OTP is ' +
        'missing/expired/wrong.',
      examples: {
        alreadySet: {
          summary: 'Password already set',
          value: {
            statusCode: 400,
            status: 'Failure',
            message: 'This account already has a password. Use change password instead.',
            error: 'Bad Request',
            traceId: '38cf5d10-00cb-4e4b-8417-f9e63e877466',
            data: null,
          },
        },
        invalidOtp: {
          summary: 'Invalid or expired OTP',
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
    }),
    ApiResponse({
      status: 401,
      description: 'The access token is missing or expired.',
    }),
    ApiResponse({
      status: 403,
      description: 'Authenticated as a platform admin, not a tenant user.',
    })
  );
}

export function ApiUpdateLocale(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Set the language responses are rendered in',
      description:
        'Persists `users.locale`, then re-signs *only* the access token so the new value is on ' +
        "its `locale` claim immediately — this tab's own requests read the new language right " +
        'away rather than waiting for the access token to expire and refresh. Deliberately does ' +
        'not touch the refresh token (unlike change-password/set-password): a locale preference ' +
        "is not proof of anything beyond what the caller's existing access token already " +
        'proves, so this must not be usable to mint a fresh 7-day refresh token from one. ' +
        'Another signed-in tab simply keeps its own locale until it next refreshes. Tenant-user ' +
        'tokens only.',
    }),
    ApiBody({
      type: UpdateLocaleDto,
      examples: { default: { summary: 'Typical request', value: { locale: 'de' } } },
    }),
    ApiResponse({
      status: 200,
      description: 'Locale updated; a fresh access token is issued (no refresh token).',
      type: UpdateLocaleResponseDto,
      examples: {
        default: {
          summary: 'Updated',
          value: {
            accessToken: TOKEN_RESPONSE_EXAMPLE.accessToken,
            expiresIn: TOKEN_RESPONSE_EXAMPLE.expiresIn,
            user: { ...TOKEN_RESPONSE_EXAMPLE.user, locale: 'de' },
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: '`locale` is missing or not one of the supported values.',
    }),
    ApiResponse({
      status: 401,
      description: 'The access token is missing or expired.',
    }),
    ApiResponse({
      status: 403,
      description: 'Authenticated as a platform admin, not a tenant user.',
    })
  );
}

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
            status: UserStatus.PENDING_VERIFICATION,
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
    }),
    ApiResponse({
      status: 429,
      description:
        'Too many verification attempts for this address within the current window ' +
        '(`OtpAttemptService`, keyed per-account on top of the per-IP throttler).',
      examples: {
        default: {
          summary: 'Too many attempts',
          value: {
            statusCode: 429,
            status: 'Failure',
            message: 'Too many verification attempts. Request a new code and try again shortly.',
            error: 'Too Many Requests',
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
        'Tenant-user login only — platform admins have their own route, ' +
        '`POST /v1/admin/auth/login` (see `separate-admin-login-design.md` for why the two were ' +
        'split apart). A still-`pending_verification` account is not an error here: credentials ' +
        'are checked first, and on success a fresh OTP is sent and a `pending_verification` ' +
        'result is returned instead of tokens — the frontend renders the same OTP stepper the ' +
        'signup wizard uses. `disabled`/`suspended` accounts fail with 403. The refresh token is ' +
        'set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.',
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
        'A full tenant token pair, or a pending_verification result (see ' +
        'LoginPendingVerificationDto) — the frontend tells them apart by whether the body carries ' +
        '`user` or `status`.',
      type: TokenResponseDto,
      examples: {
        success: { summary: 'Active tenant account', value: TOKEN_RESPONSE_EXAMPLE },
        pendingVerification: {
          summary: 'Still pending verification',
          value: {
            status: UserStatus.PENDING_VERIFICATION,
            email: 'jane@thecoffeehouse.com',
            message: 'Verification code sent to jane@thecoffeehouse.com',
          } satisfies LoginPendingVerificationDto,
        },
      },
    }),
    ApiResponse({
      status: 401,
      description:
        'Wrong password, unknown email, an SSO-only account attempting password login, or the ' +
        'account is temporarily locked out after too many failed attempts (`LoginAttemptService` ' +
        '— per-account, on top of the per-IP throttler) — the same message for all four, so a ' +
        'lockout cannot be distinguished from a wrong password by the response alone.',
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
        'Re-presenting an already-spent token is judged by age: within a short grace window it ' +
        'is treated as a lost two-tab race and the session is preserved; older than that, every ' +
        'refresh token for that user is revoked as suspected reuse of a leaked token.',
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

export function ApiGoogleAuthorize(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Start Google sign-in or signup',
      description:
        "Redirects (302) to Google's consent screen and sets the `google_auth_sid` cookie that " +
        'binds the round trip to this browser. Not an XHR endpoint — the SPA navigates here, so ' +
        'the response is a redirect rather than JSON. Carries no business name: a genuinely new ' +
        'signup collects one afterward, at `POST /v1/auth/google/complete-signup`.',
    }),
    ApiQuery({ name: 'intent', enum: OAuthIntent, required: true, example: OAuthIntent.SIGNUP }),
    ApiResponse({ status: 302, description: 'Redirect to Google' }),
    ApiResponse({ status: 503, description: 'GOOGLE_CLIENT_ID / SECRET / CALLBACK_URL unset' })
  );
}

export function ApiGoogleCallback(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Google sign-in callback',
      description:
        'Where Google returns the browser. Consumes the one-time state *before* exchanging the ' +
        'code, then resolves the identity: a known `user_identities` row signs in; a matching ' +
        'email links the identity and signs in; neither, under `intent=login`, is `?error=' +
        'NO_ACCOUNT`; neither, under `intent=signup`, sets a `google_pending_signup` cookie and ' +
        'redirects to /onboarding/business-name to collect the one thing Google cannot supply. ' +
        'Always a 302 — success sets the session cookies, every failure appends `?error=` to ' +
        '/login or /onboarding/signup, because a JSON body would paint as a document here.',
    }),
    ApiResponse({
      status: 302,
      description: 'Signed in, sent to collect a business name, or redirected with ?error=',
    })
  );
}

export function ApiCompleteGoogleSignup(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Finish a Google signup with a business name',
      description:
        'Only reachable after the callback set a `google_pending_signup` cookie for a ' +
        'genuinely new person — Google returns a person, not a business, and `tenants.name` is ' +
        'NOT NULL. Creates the tenant + owner + settings + default prompts and issues session ' +
        'cookies, same as every other successful auth endpoint (unlike the two Google endpoints ' +
        'above, this is a normal XHR call, not a redirect).',
    }),
    ApiBody({ type: CompleteGoogleSignupDto }),
    ApiResponse({
      status: 200,
      description: 'Tenant created and signed in',
      schema: { example: TOKEN_RESPONSE_EXAMPLE },
    }),
    ApiResponse({
      status: 400,
      description: 'Missing, expired, or already-consumed pending signup',
    }),
    ApiResponse({ status: 409, description: 'Someone else registered this email in the meantime' })
  );
}

export function ApiMe(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'The signed-in tenant user',
      description:
        'The authoritative profile for the current access token — name, email, role, the tenant ' +
        'name, and whether a password is set. Settings reads this rather than reassembling it ' +
        'from client-side storage, which could not answer either question for a Google sign-in ' +
        '(a redirect-only flow that never returns a JSON body to the SPA).',
    }),
    ApiResponse({
      status: 200,
      type: AuthenticatedUserDto,
      examples: { default: { summary: 'Signed in', value: TOKEN_RESPONSE_EXAMPLE.user } },
    }),
    ApiResponse({ status: 401, description: 'Missing or expired access token.' }),
    ApiResponse({
      status: 403,
      description: 'Authenticated as a platform admin, not a tenant user.',
    })
  );
}
