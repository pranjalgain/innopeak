import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { isProduction } from '@config/deployment-target.util';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
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
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginPendingVerificationDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SignupResponseDto } from './dto/signup-response.dto';
import { SignupDto } from './dto/signup.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  ApiChangePassword,
  ApiLogin,
  ApiLogout,
  ApiRefresh,
  ApiResendOtp,
  ApiSignup,
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
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
    }

    const result = await this.authService.refresh(rawRefreshToken);
    this.setSessionCookies(res, result.refreshToken, result.body.accessToken);
    return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
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

  private clearSessionCookies(res: Response): void {
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.cookieOptions(REFRESH_TOKEN_COOKIE_PATH));
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, this.cookieOptions(ACCESS_TOKEN_COOKIE_PATH));
    res.clearCookie(SESSION_HINT_COOKIE_NAME, this.cookieOptions(SESSION_HINT_COOKIE_PATH));
  }
}
