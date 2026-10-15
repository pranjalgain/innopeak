import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_COOKIE_PATH,
  ACCESS_TOKEN_TTL_SECONDS,
  ADMIN_ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
  SESSION_HINT_COOKIE_NAME,
  SESSION_HINT_COOKIE_PATH,
  SESSION_HINT_TENANT_VALUE,
} from './constants/auth.constants';
import {
  GOOGLE_AUTH_SID_COOKIE_NAME,
  GOOGLE_AUTH_SID_COOKIE_PATH,
} from './constants/google-auth.constants';
import {
  MICROSOFT_AUTH_SID_COOKIE_NAME,
  MICROSOFT_AUTH_SID_COOKIE_PATH,
} from './constants/microsoft-auth.constants';
import {
  LEGACY_GOOGLE_PENDING_SIGNUP_COOKIE_NAME,
  OAUTH_STATE_TTL_SECONDS,
  SSO_PENDING_SIGNUP_COOKIE_NAME,
  SSO_PENDING_SIGNUP_COOKIE_PATH,
  SSO_PENDING_SIGNUP_TTL_SECONDS,
  SSO_REDIRECT,
} from './constants/sso-auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { AcceptMemberInviteDto } from './dto/accept-member-invite.dto';
import { AuthenticatedUserDto } from './dto/authenticated-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteSsoSignupDto } from './dto/complete-sso-signup.dto';
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { LoginPendingVerificationDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { MemberInvitePreviewDto } from './dto/member-invite-preview.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { RestoreAccountDto } from './dto/restore-account.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SignupResponseDto } from './dto/signup-response.dto';
import { SignupDto } from './dto/signup.dto';
import { SsoAuthorizeQueryDto } from './dto/sso-authorize-query.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UpdateLocaleResponseDto } from './dto/update-locale-response.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { UserRole } from './enums/user-role.enum';
import { RefreshTokenSupersededException } from './errors/refresh-token.error';
import { InvalidRefreshTokenException } from './exceptions/auth.exceptions';
import { AccountDeletionService } from './services/account-deletion.service';
import { AuthService } from './services/auth.service';
import {
  ApiAcceptMemberInvite,
  ApiChangePassword,
  ApiCompleteSsoSignup,
  ApiDeleteAccount,
  ApiGoogleAuthorize,
  ApiGoogleCallback,
  ApiInviteGoogleAuthorize,
  ApiLogin,
  ApiLogout,
  ApiMe,
  ApiMicrosoftAuthorize,
  ApiMicrosoftCallback,
  ApiRefresh,
  ApiRequestDeleteAccountOtp,
  ApiRequestSetPasswordOtp,
  ApiResendOtp,
  ApiRestoreAccount,
  ApiSetPassword,
  ApiSignup,
  ApiUpdateLocale,
  ApiValidateMemberInvite,
  ApiVerifyEmail,
} from './swagger/auth.swagger';
import type { AuthUser } from './types/auth.type';
import { setAdminSessionCookies } from './utils/admin-session-cookies.util';
import { buildCookieOptions, buildSessionHintCookieOptions } from './utils/cookie-options.util';

@Controller({ path: RouteNames.AUTH, version: '1' })
@ApiTags('Auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountDeletionService: AccountDeletionService
  ) {}

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

  /** Tenant users only; platform admins log in at `POST /v1/admin/auth/login`. */
  @Post(RouteNames.LOGIN)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiLogin()
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<LoginPendingVerificationDto | TokenResponseDto>> {
    const result = await this.authService.login(dto);

    if (!('refreshToken' in result)) {
      return ResponseUtil.success(result, result.message, HttpStatus.OK);
    }

    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
  }

  /**
   * Clears the session cookies when the session is definitively dead. Otherwise the `session` hint
   * (7-day maxAge, read by edge middleware) outlives it and /login and /dashboard bounce forever,
   * hammering refresh until the throttler rejects it.
   * `RefreshTokenSupersededException` is exempt: it lost a concurrent rotation and the browser
   * already holds the winner's valid cookies.
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
      throw new InvalidRefreshTokenException();
    }

    try {
      const result = await this.authService.refresh(rawRefreshToken);
      this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
      return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
    } catch (error) {
      // The superseded exception is an UnauthorizedException subclass; exclude it or a lost race
      // clears the winner's cookies.
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
   * `@Public()` on purpose: a JWT-guarded logout would 401 on an expired access token before
   * revoking the live refresh token. Authority comes from the refresh cookie instead.
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

  /** Read from the database so Settings does not trust whatever localStorage holds. */
  @Get(RouteNames.ME)
  @ApiMe()
  async me(@CurrentUser() user: AuthUser): Promise<ApiResponse<AuthenticatedUserDto>> {
    const profile = await this.authService.me(user);
    return ResponseUtil.success(profile, undefined, HttpStatus.OK);
  }

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

  /** Step-up OTP: an access token alone is not proof enough to grant a passwordless account its first password. */
  @Post(RouteNames.REQUEST_SET_PASSWORD_OTP)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiRequestSetPasswordOtp()
  async requestSetPasswordOtp(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<{ message: string }>> {
    const result = await this.authService.requestSetPasswordOtp(user);
    return ResponseUtil.success(result, result.message, HttpStatus.OK);
  }

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

  /** Step-up OTP for an owner with no password. */
  @Post(RouteNames.REQUEST_DELETE_ACCOUNT_OTP)
  @Roles(UserRole.OWNER)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiRequestDeleteAccountOtp()
  async requestDeleteAccountOtp(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<{ message: string }>> {
    const result = await this.accountDeletionService.requestOtp(user);
    return ResponseUtil.success(result, result.message, HttpStatus.OK);
  }

  /** Signs the caller out afterwards; their session is dead anyway. */
  @Post(RouteNames.DELETE_ACCOUNT)
  @Roles(UserRole.OWNER)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiDeleteAccount()
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<DeleteAccountResponseDto>> {
    const result = await this.accountDeletionService.deleteAccount(user, dto);
    this.clearSessionCookies(res);
    return ResponseUtil.success(result, MESSAGES.AUTH.ACCOUNT_DELETION_SCHEDULED, HttpStatus.OK);
  }

  /** Public — the owner's session is gone, so this proves them with email + password instead. */
  @Post(RouteNames.RESTORE_ACCOUNT)
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiRestoreAccount()
  async restoreAccount(@Body() dto: RestoreAccountDto): Promise<ApiResponse<{ message: string }>> {
    const result = await this.accountDeletionService.restoreAccount(dto);
    return ResponseUtil.success(result, result.message, HttpStatus.OK);
  }

  /** Re-signs only the access token cookie; deliberately leaves the refresh token alone (see `AuthService.updateLocale`). */
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

  /** A GET because the browser navigates here directly, so there is no CORS preflight. */
  @Get(RouteNames.GOOGLE)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiGoogleAuthorize()
  async googleAuthorize(@Query() query: SsoAuthorizeQueryDto, @Res() res: Response): Promise<void> {
    const redirect = await this.authService.buildGoogleAuthorizeRedirect({ intent: query.intent });

    if (!redirect.ok) {
      // The browser navigated here, so an exception filter's JSON body would paint as a document
      // and strand the user on an API error page — redirect instead, same as the callback below.
      res.redirect(HttpStatus.FOUND, redirect.redirectUrl);
      return;
    }

    res.cookie(GOOGLE_AUTH_SID_COOKIE_NAME, redirect.sid, {
      ...buildCookieOptions(GOOGLE_AUTH_SID_COOKIE_PATH, OAUTH_STATE_TTL_SECONDS),
    });
    res.redirect(HttpStatus.FOUND, redirect.authorizationUrl);
  }

  /**
   * Google, not the SPA, sends the browser here with no bearer token; context comes from the signed
   * `state` plus its Redis record. Every outcome is a 302 because the browser is mid-navigation.
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
      res.redirect(HttpStatus.FOUND, outcome.redirectUrl);
      return;
    }

    if (outcome.kind === 'needs_business_name') {
      res.cookie(SSO_PENDING_SIGNUP_COOKIE_NAME, outcome.pendingSignupCookie, {
        ...buildCookieOptions(SSO_PENDING_SIGNUP_COOKIE_PATH, SSO_PENDING_SIGNUP_TTL_SECONDS),
      });
      res.redirect(HttpStatus.FOUND, SSO_REDIRECT.NEEDS_BUSINESS_NAME);
      return;
    }

    if (outcome.kind === 'admin_signed_in') {
      setAdminSessionCookies(res, outcome.tokens.body.accessToken);
      res.redirect(HttpStatus.FOUND, SSO_REDIRECT.ADMIN_SUCCESS);
      return;
    }

    this.setSessionCookies(res, outcome.tokens.refreshToken, outcome.tokens.body.accessToken);
    res.redirect(HttpStatus.FOUND, SSO_REDIRECT.SUCCESS);
  }

  /** A GET because the browser navigates here directly, so there is no CORS preflight. */
  @Get(RouteNames.MICROSOFT)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiMicrosoftAuthorize()
  async microsoftAuthorize(
    @Query() query: SsoAuthorizeQueryDto,
    @Res() res: Response
  ): Promise<void> {
    const redirect = await this.authService.buildMicrosoftAuthorizeRedirect({
      intent: query.intent,
    });

    if (!redirect.ok) {
      res.redirect(HttpStatus.FOUND, redirect.redirectUrl);
      return;
    }

    res.cookie(
      MICROSOFT_AUTH_SID_COOKIE_NAME,
      redirect.sid,
      buildCookieOptions(MICROSOFT_AUTH_SID_COOKIE_PATH, OAUTH_STATE_TTL_SECONDS)
    );
    res.redirect(HttpStatus.FOUND, redirect.authorizationUrl);
  }

  /** Microsoft, not the SPA, sends the browser here; every outcome is a 302 because it is mid-navigation. */
  @Get(RouteNames.MICROSOFT_CALLBACK)
  @Public()
  @ApiMicrosoftCallback()
  async microsoftCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const query = req.query as Record<string, string | undefined>;
    const outcome = await this.authService.handleMicrosoftCallback({
      code: query['code'],
      state: query['state'],
      error: query['error'],
      sid: (req.cookies as Record<string, string | undefined> | undefined)?.[
        MICROSOFT_AUTH_SID_COOKIE_NAME
      ],
    });

    // Cleared unconditionally: single-use by design, see the Google callback.
    res.clearCookie(MICROSOFT_AUTH_SID_COOKIE_NAME, { path: MICROSOFT_AUTH_SID_COOKIE_PATH });

    if (!outcome.ok) {
      res.redirect(HttpStatus.FOUND, outcome.redirectUrl);
      return;
    }

    if (outcome.kind === 'needs_business_name') {
      res.cookie(
        SSO_PENDING_SIGNUP_COOKIE_NAME,
        outcome.pendingSignupCookie,
        buildCookieOptions(SSO_PENDING_SIGNUP_COOKIE_PATH, SSO_PENDING_SIGNUP_TTL_SECONDS)
      );
      res.redirect(HttpStatus.FOUND, SSO_REDIRECT.NEEDS_BUSINESS_NAME);
      return;
    }

    // The admin sign-in route's round trip (`OAuthIntent.ADMIN_LOGIN`) lands here too.
    if (outcome.kind === 'admin_signed_in') {
      setAdminSessionCookies(res, outcome.tokens.body.accessToken);
      res.redirect(HttpStatus.FOUND, SSO_REDIRECT.ADMIN_SUCCESS);
      return;
    }

    this.setSessionCookies(res, outcome.tokens.refreshToken, outcome.tokens.body.accessToken);
    res.redirect(HttpStatus.FOUND, SSO_REDIRECT.SUCCESS);
  }

  @Get(RouteNames.INVITE_VALIDATE)
  @Public()
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @ApiValidateMemberInvite()
  async validateMemberInvite(
    @Param('token') token: string
  ): Promise<ApiResponse<MemberInvitePreviewDto>> {
    const result = await this.authService.validateMemberInvite(token);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.INVITE_ACCEPT)
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiAcceptMemberInvite()
  async acceptMemberInvite(
    @Body() dto: AcceptMemberInviteDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<TokenResponseDto>> {
    const result = await this.authService.acceptMemberInvite(dto);
    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, MESSAGES.AUTH.INVITE_ACCEPTED, HttpStatus.OK);
  }

  /**
   * Own route rather than `GET /v1/auth/google`: a first-time invitee has no `user_identities` row
   * for that generic callback branch to find. Completes at the shared callback via `OAuthIntent.INVITE`.
   */
  @Get(RouteNames.INVITE_GOOGLE)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiInviteGoogleAuthorize()
  async inviteGoogleAuthorize(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const redirect = await this.authService.buildMemberInviteGoogleRedirect(token);

    if (!redirect.ok) {
      res.redirect(HttpStatus.FOUND, redirect.redirectUrl);
      return;
    }

    // Same binding cookie as every other entry into the shared Google callback.
    res.cookie(
      GOOGLE_AUTH_SID_COOKIE_NAME,
      redirect.sid,
      buildCookieOptions(GOOGLE_AUTH_SID_COOKIE_PATH, OAUTH_STATE_TTL_SECONDS)
    );
    res.redirect(HttpStatus.FOUND, redirect.authorizationUrl);
  }

  /** A normal XHR endpoint returning JSON, unlike the two above: no browser navigation to preserve. */
  @Post(RouteNames.SSO_COMPLETE_SIGNUP)
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiCompleteSsoSignup()
  async completeSsoSignup(
    @Body() dto: CompleteSsoSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<TokenResponseDto>> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    // TRANSITIONAL: a Google signup that reached the business-name step before the rename still holds the old cookie.
    const pendingSignupCookie =
      cookies?.[SSO_PENDING_SIGNUP_COOKIE_NAME] ??
      cookies?.[LEGACY_GOOGLE_PENDING_SIGNUP_COOKIE_NAME];

    const result = await this.authService.completeSsoSignup(pendingSignupCookie, dto.businessName);

    // Cleared unconditionally, same reasoning as the OAuth binding cookie: single-use by design.
    res.clearCookie(SSO_PENDING_SIGNUP_COOKIE_NAME, { path: SSO_PENDING_SIGNUP_COOKIE_PATH });
    res.clearCookie(LEGACY_GOOGLE_PENDING_SIGNUP_COOKIE_NAME, {
      path: SSO_PENDING_SIGNUP_COOKIE_PATH,
    });
    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
  }

  private readRefreshTokenCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined> | undefined)?.[
      REFRESH_TOKEN_COOKIE_NAME
    ];
  }

  /**
   * - `refresh_token`: long-lived, never in a JSON body, scoped to `/v1/auth` so only refresh/logout receive it.
   * - `access_token`: scoped to `/`; also returned in the body for non-browser clients (the web app uses only the cookie).
   * - `session`: not httpOnly and carries no credential; lets edge middleware and client route guards tell
   *   signed in from out (and which principal) despite the access cookie's 15-minute expiry.
   */
  private setSessionCookies(res: Response, refreshToken: string, accessToken: string): void {
    res.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
      refreshToken,
      buildCookieOptions(REFRESH_TOKEN_COOKIE_PATH, REFRESH_TOKEN_TTL_SECONDS)
    );
    res.cookie(
      ACCESS_TOKEN_COOKIE_NAME,
      accessToken,
      buildCookieOptions(ACCESS_TOKEN_COOKIE_PATH, ACCESS_TOKEN_TTL_SECONDS)
    );
    res.cookie(
      SESSION_HINT_COOKIE_NAME,
      SESSION_HINT_TENANT_VALUE,
      buildSessionHintCookieOptions(SESSION_HINT_COOKIE_PATH, REFRESH_TOKEN_TTL_SECONDS)
    );
  }

  /**
   * Only `access_token`, for `updateLocale`: safe because the principal never changes there, so the
   * refresh token and session hint stay untouched.
   */
  private setAccessTokenCookie(res: Response, accessToken: string): void {
    res.cookie(
      ACCESS_TOKEN_COOKIE_NAME,
      accessToken,
      buildCookieOptions(ACCESS_TOKEN_COOKIE_PATH, ACCESS_TOKEN_TTL_SECONDS)
    );
  }

  /**
   * Clears every cookie either principal could hold so logout stays one principal-agnostic endpoint;
   * clearing a cookie the browser never had is a harmless no-op.
   */
  private clearSessionCookies(res: Response): void {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, buildCookieOptions(REFRESH_TOKEN_COOKIE_PATH));
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, buildCookieOptions(ACCESS_TOKEN_COOKIE_PATH));
    res.clearCookie(ADMIN_ACCESS_TOKEN_COOKIE_NAME, buildCookieOptions(ACCESS_TOKEN_COOKIE_PATH));
    res.clearCookie(
      SESSION_HINT_COOKIE_NAME,
      buildSessionHintCookieOptions(SESSION_HINT_COOKIE_PATH)
    );
  }
}
