import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { isProduction } from '@config/deployment-target.util';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import { AuthService } from './auth.service';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_COOKIE_PATH,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
  SESSION_HINT_COOKIE_NAME,
  SESSION_HINT_COOKIE_PATH,
  SESSION_HINT_COOKIE_VALUE,
} from './constants/auth.constants';
import {
  GOOGLE_AUTH_REDIRECT,
  GOOGLE_AUTH_SID_COOKIE_NAME,
  GOOGLE_AUTH_SID_COOKIE_PATH,
  GOOGLE_AUTH_STATE_TTL_SECONDS,
  GOOGLE_PENDING_SIGNUP_COOKIE_NAME,
  GOOGLE_PENDING_SIGNUP_COOKIE_PATH,
  GOOGLE_PENDING_SIGNUP_TTL_SECONDS,
  GoogleAuthFailure,
} from './constants/google-auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthenticatedUserDto } from './dto/authenticated-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteGoogleSignupDto } from './dto/complete-google-signup.dto';
import { GoogleAuthorizeQueryDto } from './dto/google-authorize-query.dto';
import { LoginPendingVerificationDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { PlatformAdminTokenResponseDto } from './dto/platform-admin-token-response.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SignupResponseDto } from './dto/signup-response.dto';
import { SignupDto } from './dto/signup.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UpdateLocaleResponseDto } from './dto/update-locale-response.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { OAuthIntent } from './enums/oauth-intent.enum';
import { RefreshTokenSupersededException } from './errors/refresh-token.error';
import {
  ApiChangePassword,
  ApiCompleteGoogleSignup,
  ApiGoogleAuthorize,
  ApiGoogleCallback,
  ApiLogin,
  ApiLogout,
  ApiMe,
  ApiRefresh,
  ApiResendOtp,
  ApiSetPassword,
  ApiSignup,
  ApiUpdateLocale,
  ApiVerifyEmail,
} from './swagger/auth.swagger';
import type { AuthUser } from './types/auth-user.type';

@Controller({ path: RouteNames.AUTH, version: '1' })
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post(RouteNames.SIGNUP)
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiSignup()
  async signup(@Body() dto: SignupDto): Promise<ApiResponse<SignupResponseDto>> {
    const response = await this.authService.signup(dto);
    return ResponseUtil.success(response, response.message, HttpStatus.CREATED);
  }

  @Post(RouteNames.VERIFY_EMAIL)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiVerifyEmail()
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<TokenResponseDto>> {
    const result = await this.authService.verifyEmail(dto);
    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.RESEND_VERIFICATION_OTP)
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiResendOtp()
  async resendOtp(@Body() dto: ResendOtpDto): Promise<ApiResponse<{ message: string }>> {
    const response = await this.authService.resendOtp(dto);
    return ResponseUtil.success(response, response.message, HttpStatus.OK);
  }

  /**
   * One endpoint for every principal type — the frontend has a single sign-in screen with no
   * "I'm an admin" toggle, so `AuthService.login` itself resolves which identity space the email
   * belongs to (see its own doc comment). A platform admin only ever gets an access-token cookie
   * (no refresh-token rotation exists for that principal yet); the response's `admin` field is
   * what the frontend uses to route to `/admin` instead of `/dashboard`.
   */
  @Post(RouteNames.LOGIN)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiLogin()
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<
    ApiResponse<LoginPendingVerificationDto | PlatformAdminTokenResponseDto | TokenResponseDto>
  > {
    const result = await this.authService.login(dto);

    if ('admin' in result) {
      this.setAdminSessionCookies(res, result.body.accessToken);
      return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
    }

    if (!('refreshToken' in result)) {
      return ResponseUtil.success(result, result.message, HttpStatus.OK);
    }

    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
  }

  /**
   * When the session is definitively gone — no cookie at all, a revoked/expired token, a row a
   * dev DB reset deleted, a disabled user, a suspended tenant — `clearSessionCookies` runs before
   * the 401 propagates.
   *
   * Without it, only the two real token cookies go stale; `session` (the frontend edge
   * middleware's routing hint — see `proxy.ts`) has its own 7-day `maxAge` set once at login and
   * nothing about a failed refresh ever touches it. The client then hard-redirects to `/login` on
   * the 401, the middleware sees the still-present hint and bounces straight back to `/dashboard`,
   * that remount retries the now-permanently-dead refresh, and the two sides fight forever —
   * `POST /v1/auth/refresh` firing on every bounce until `@Throttle` starts rejecting it outright.
   *
   * **`RefreshTokenSupersededException` is the deliberate exception to that.** A token that lost
   * a concurrent rotation race is also "not active", but the winner has already issued a valid
   * successor and the browser is holding it — clearing there would throw away a live session and
   * log the user out of every open tab, which is exactly what happens with two idle dashboard
   * tabs waking at once (the frontend's single-flight is per-tab, so both refresh). That case
   * gets the same 401 and the same message, and keeps its cookies; the client simply retries and
   * succeeds with the successor. See `TokenService.rotate` for how the two are told apart.
   */
  @Post(RouteNames.REFRESH)
  @Public()
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiRefresh()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<TokenResponseDto>> {
    const rawRefreshToken = this.readRefreshTokenCookie(req);

    if (!rawRefreshToken) {
      this.clearSessionCookies(res);
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

    try {
      const result = await this.authService.refresh(rawRefreshToken);
      this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
      return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
    } catch (error) {
      // Order matters: the superseded subclass IS an UnauthorizedException, so it has to be
      // excluded explicitly or a lost race would clear the winner's cookies.
      if (
        error instanceof UnauthorizedException &&
        !(error instanceof RefreshTokenSupersededException)
      ) {
        this.clearSessionCookies(res);
      }
      throw error;
    }
  }

  /**
   * `@Public()` on purpose: the session most in need of revoking is one whose access token has
   * already expired, and a JWT-guarded logout would 401 before revoking anything — leaving a live
   * 7-day refresh token behind a UI that says "signed out". Authority comes from the refresh
   * cookie instead (see AuthService.logout), and cookies are cleared either way.
   */
  @Post(RouteNames.LOGOUT)
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiLogout()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<{ message: string }>> {
    const response = await this.authService.logout(this.readRefreshTokenCookie(req));
    this.clearSessionCookies(res);
    return ResponseUtil.success(response, response.message, HttpStatus.OK);
  }

  /**
   * Who is signed in, read from the database rather than reconstructed client-side. Settings'
   * Profile tab reads this instead of trusting whatever its last sign-in happened to leave in
   * localStorage.
   */
  @Get(RouteNames.ME)
  @ApiMe()
  async me(@CurrentUser() user: AuthUser): Promise<ApiResponse<AuthenticatedUserDto>> {
    const profile = await this.authService.me(user);
    return ResponseUtil.success(profile, undefined, HttpStatus.OK);
  }

  /** Settings → Profile. Not `@Public()` — JwtAuthGuard supplies `user`. */
  @Post(RouteNames.CHANGE_PASSWORD)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiChangePassword()
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<TokenResponseDto>> {
    const result = await this.authService.changePassword(user, dto);
    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, MESSAGES.AUTH.PASSWORD_CHANGED, HttpStatus.OK);
  }

  /** Settings → Profile, "Add password" — only for an account with no `password_hash` yet. */
  @Post(RouteNames.SET_PASSWORD)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiSetPassword()
  async setPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetPasswordDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<TokenResponseDto>> {
    const result = await this.authService.setPassword(user, dto);
    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, MESSAGES.AUTH.PASSWORD_SET, HttpStatus.OK);
  }

  /**
   * Settings → Profile, language preference. Not `@Public()` — JwtAuthGuard supplies `user`.
   * Re-signs only the access token cookie — see `AuthService.updateLocale`'s doc comment for why
   * this deliberately does not touch the refresh token the way every other token-issuing route
   * here does.
   */
  @Post(RouteNames.UPDATE_LOCALE)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiUpdateLocale()
  async updateLocale(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLocaleDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<UpdateLocaleResponseDto>> {
    const result = await this.authService.updateLocale(user, dto);
    this.setAccessTokenCookie(res, result.accessToken);
    return ResponseUtil.success(result, MESSAGES.AUTH.LOCALE_UPDATED, HttpStatus.OK);
  }

  /**
   * Step one of Google sign-in. A `GET` because the browser navigates here directly — the SPA sets
   * `window.location`, so the access cookie rides along and there is no CORS preflight.
   *
   * `@Public()`: signup has no session yet, and login by definition does not either.
   */
  @Get(RouteNames.GOOGLE)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiGoogleAuthorize()
  async googleAuthorize(
    @Query() query: GoogleAuthorizeQueryDto,
    @Res() res: Response
  ): Promise<void> {
    const returnTo =
      query.intent === OAuthIntent.SIGNUP
        ? GOOGLE_AUTH_REDIRECT.SIGNUP
        : GOOGLE_AUTH_REDIRECT.LOGIN;

    let redirect: { authorizationUrl: string; sid: string };
    try {
      redirect = await this.authService.buildGoogleAuthorizeRedirect({ intent: query.intent });
    } catch {
      // Same reasoning as the callback below: the browser navigated here, so an exception filter's
      // JSON body would paint as a document and strand the user on an API error page. The only
      // expected failure is an unconfigured Google client.
      res.redirect(HttpStatus.FOUND, `${returnTo}?error=${GoogleAuthFailure.NOT_CONFIGURED}`);
      return;
    }

    res.cookie(GOOGLE_AUTH_SID_COOKIE_NAME, redirect.sid, {
      ...this.cookieOptions(GOOGLE_AUTH_SID_COOKIE_PATH, GOOGLE_AUTH_STATE_TTL_SECONDS),
    });
    res.redirect(HttpStatus.FOUND, redirect.authorizationUrl);
  }

  /**
   * Step two. `@Public()` because Google — not the SPA — sends the browser here, carrying no
   * bearer token; all context comes from the signed `state` plus the Redis record it names.
   *
   * Every outcome is a 302, success included: the browser is mid-navigation and would render a
   * JSON body as a document. Success sets the session cookies on the way past.
   */
  @Get(RouteNames.GOOGLE_CALLBACK)
  @Public()
  @ApiGoogleCallback()
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const query = req.query as Record<string, string | undefined>;

    const outcome = await this.authService.handleGoogleCallback({
      code: query['code'],
      state: query['state'],
      error: query['error'],
      sid: (req.cookies as Record<string, string | undefined> | undefined)?.[
        GOOGLE_AUTH_SID_COOKIE_NAME
      ],
    });

    // Cleared unconditionally: the binding cookie is single-use by design, so leaving it behind
    // would let an abandoned round trip satisfy a later callback's check.
    res.clearCookie(GOOGLE_AUTH_SID_COOKIE_NAME, { path: GOOGLE_AUTH_SID_COOKIE_PATH });

    if (!outcome.ok) {
      const base =
        outcome.intent === OAuthIntent.SIGNUP
          ? GOOGLE_AUTH_REDIRECT.SIGNUP
          : GOOGLE_AUTH_REDIRECT.LOGIN;
      res.redirect(HttpStatus.FOUND, `${base}?error=${outcome.failure}`);
      return;
    }

    if (outcome.kind === 'needs_business_name') {
      res.cookie(GOOGLE_PENDING_SIGNUP_COOKIE_NAME, outcome.pendingSignupCookie, {
        ...this.cookieOptions(GOOGLE_PENDING_SIGNUP_COOKIE_PATH, GOOGLE_PENDING_SIGNUP_TTL_SECONDS),
      });
      res.redirect(HttpStatus.FOUND, GOOGLE_AUTH_REDIRECT.NEEDS_BUSINESS_NAME);
      return;
    }

    this.setSessionCookies(res, outcome.tokens.refreshToken, outcome.tokens.body.accessToken);
    res.redirect(HttpStatus.FOUND, GOOGLE_AUTH_REDIRECT.SUCCESS);
  }

  /**
   * Step three, only for a genuinely new signup: submits the one thing Google could not supply.
   * A normal XHR endpoint, unlike the two above — there is no browser navigation to preserve here,
   * so this returns JSON like every other auth endpoint instead of a redirect.
   */
  @Post(RouteNames.GOOGLE_COMPLETE_SIGNUP)
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiCompleteGoogleSignup()
  async completeGoogleSignup(
    @Body() dto: CompleteGoogleSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<TokenResponseDto>> {
    const pendingSignupCookie = (req.cookies as Record<string, string | undefined> | undefined)?.[
      GOOGLE_PENDING_SIGNUP_COOKIE_NAME
    ];

    const result = await this.authService.completeGoogleSignup(
      pendingSignupCookie,
      dto.businessName
    );

    // Cleared unconditionally, same reasoning as the OAuth binding cookie: single-use by design.
    res.clearCookie(GOOGLE_PENDING_SIGNUP_COOKIE_NAME, { path: GOOGLE_PENDING_SIGNUP_COOKIE_PATH });
    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
  }

  private readRefreshTokenCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined> | undefined)?.[
      REFRESH_TOKEN_COOKIE_NAME
    ];
  }

  /** Shared attributes for all three session cookies — only `path` and `maxAge` differ between them. */
  private cookieOptions(path: string, maxAgeSeconds?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'lax',
      path,
      ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds * 1000 }),
    };
  }

  /**
   * Three cookies, each with a distinct job:
   *
   * - `refresh_token` — the long-lived credential. Never in a JSON body, and scoped to `/v1/auth`
   *   so a browser only ever sends it to the two routes that need it (refresh, logout).
   * - `access_token` — scoped to `/` because every authenticated route needs it. The same token
   *   is *also* returned in the JSON body so the frontend can keep its own copy for the `Bearer`
   *   header (it can't read an httpOnly cookie), and `JwtStrategy` accepts either.
   * - `session` — no credential at all, just a flag. It exists so the frontend's edge middleware
   *   can tell "signed in" from "signed out" before any JS runs, without being misled by the
   *   access cookie's 15-minute expiry into bouncing a still-refreshable visitor to /login.
   */
  private setSessionCookies(res: Response, refreshToken: string, accessToken: string): void {
    res.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
      refreshToken,
      this.cookieOptions(REFRESH_TOKEN_COOKIE_PATH, REFRESH_TOKEN_TTL_SECONDS)
    );
    res.cookie(
      ACCESS_TOKEN_COOKIE_NAME,
      accessToken,
      this.cookieOptions(ACCESS_TOKEN_COOKIE_PATH, ACCESS_TOKEN_TTL_SECONDS)
    );
    res.cookie(
      SESSION_HINT_COOKIE_NAME,
      SESSION_HINT_COOKIE_VALUE,
      this.cookieOptions(SESSION_HINT_COOKIE_PATH, REFRESH_TOKEN_TTL_SECONDS)
    );
  }

  /**
   * Just the `access_token` cookie — for `updateLocale`, the one route that reissues a token
   * without also rotating the refresh token or touching the session hint (see
   * `AuthService.updateLocale`'s doc comment). That reuse is safe there because the signed-in
   * principal never changes across an `updateLocale` call.
   *
   * Do not reuse this for `login`'s admin branch — see `setAdminSessionCookies` below, which
   * exists specifically because that assumption doesn't hold for a fresh login.
   */
  private setAccessTokenCookie(res: Response, accessToken: string): void {
    res.cookie(
      ACCESS_TOKEN_COOKIE_NAME,
      accessToken,
      this.cookieOptions(ACCESS_TOKEN_COOKIE_PATH, ACCESS_TOKEN_TTL_SECONDS)
    );
  }

  /**
   * A platform-admin login's cookie shape: just the access token — no refresh-token rotation
   * exists for that principal yet — but with any leftover `refresh_token`/`session` cookies from
   * a *different, prior* principal on this browser explicitly cleared first.
   *
   * Without this, logging in as an admin on a browser that still held a tenant user's unexpired
   * `refresh_token` (scoped to `Path=/v1/auth`, 7-day lifetime, unaffected by the tenant simply
   * closing their tab) only ever overwrote `access_token`. The tenant's `refresh_token` cookie
   * was left standing, so the admin's *own* access token expiring 15 minutes later triggered the
   * ordinary `/v1/auth/refresh` flow, which reads whatever `refresh_token` is present, rotates
   * it, and overwrites `access_token` with the *tenant's* token — silently converting the admin's
   * session into that tenant's. Clearing the leftover cookies here means a stale refresh token
   * can no longer outlive the login that should have superseded it.
   */
  private setAdminSessionCookies(res: Response, accessToken: string): void {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.cookieOptions(REFRESH_TOKEN_COOKIE_PATH));
    res.clearCookie(SESSION_HINT_COOKIE_NAME, this.cookieOptions(SESSION_HINT_COOKIE_PATH));
    this.setAccessTokenCookie(res, accessToken);
  }

  private clearSessionCookies(res: Response): void {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.cookieOptions(REFRESH_TOKEN_COOKIE_PATH));
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, this.cookieOptions(ACCESS_TOKEN_COOKIE_PATH));
    res.clearCookie(SESSION_HINT_COOKIE_NAME, this.cookieOptions(SESSION_HINT_COOKIE_PATH));
  }
}
