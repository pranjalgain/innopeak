import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import {
  GOOGLE_AUTH_SID_COOKIE_NAME,
  GOOGLE_AUTH_SID_COOKIE_PATH,
} from './constants/google-auth.constants';
import { OAUTH_STATE_TTL_SECONDS } from './constants/sso-auth.constants';
import { Public } from './decorators/public.decorator';
import { AcceptAdminInviteDto } from './dto/accept-admin-invite.dto';
import { AdminInvitePreviewDto } from './dto/admin-invite-preview.dto';
import { LoginDto } from './dto/login.dto';
import { PlatformAdminTokenResponseDto } from './dto/platform-admin-token-response.dto';
import { PlatformAdminAuthService } from './services/platform-admin-auth.service';
import {
  ApiAcceptAdminInvite,
  ApiAdminGoogleLogin,
  ApiAdminLogin,
  ApiInviteGoogleAuthorize,
  ApiValidateAdminInvite,
} from './swagger/platform-admin-auth.swagger';
import { setAdminSessionCookies } from './utils/admin-session-cookies.util';
import { buildCookieOptions } from './utils/cookie-options.util';

/**
 * Public (the caller has no session yet). Not under `RouteNames.ADMIN_SETTINGS`: that path is
 * `@Roles(PLATFORM_ADMIN)`-gated, which is backwards for a login/invite-accept surface.
 */
@Controller({ path: RouteNames.ADMIN_AUTH, version: '1' })
@ApiTags('Admin Auth')
export class PlatformAdminAuthController {
  constructor(private readonly platformAdminAuthService: PlatformAdminAuthService) {}

  @Post(RouteNames.LOGIN)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiAdminLogin()
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<PlatformAdminTokenResponseDto>> {
    const result = await this.platformAdminAuthService.login(dto);
    setAdminSessionCookies(res, result.body.accessToken);
    return ResponseUtil.success(result.body, undefined, HttpStatus.OK);
  }

  /**
   * Admin Google sign-in for admins who accepted their invite via Google and so have no password.
   * Its own intent, so it never resolves to a tenant session and failures never land on the tenant login page.
   */
  @Get(RouteNames.GOOGLE)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiAdminGoogleLogin()
  async googleLogin(@Res() res: Response): Promise<void> {
    const redirect = await this.platformAdminAuthService.buildAdminLoginGoogleRedirect();

    if (!redirect.ok) {
      res.redirect(HttpStatus.FOUND, redirect.redirectUrl);
      return;
    }

    res.cookie(
      GOOGLE_AUTH_SID_COOKIE_NAME,
      redirect.sid,
      buildCookieOptions(GOOGLE_AUTH_SID_COOKIE_PATH, OAUTH_STATE_TTL_SECONDS)
    );
    res.redirect(HttpStatus.FOUND, redirect.authorizationUrl);
  }

  @Get(RouteNames.INVITE_VALIDATE)
  @Public()
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @ApiValidateAdminInvite()
  async validateAdminInvite(
    @Param('token') token: string
  ): Promise<ApiResponse<AdminInvitePreviewDto>> {
    const result = await this.platformAdminAuthService.validateAdminInvite(token);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.INVITE_ACCEPT)
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiAcceptAdminInvite()
  async acceptAdminInvite(
    @Body() dto: AcceptAdminInviteDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponse<PlatformAdminTokenResponseDto>> {
    const result = await this.platformAdminAuthService.acceptAdminInvite(dto);
    setAdminSessionCookies(res, result.body.accessToken);
    return ResponseUtil.success(result.body, MESSAGES.AUTH.INVITE_ACCEPTED, HttpStatus.OK);
  }

  /**
   * Own route rather than `GET /v1/auth/google`: a first-time invitee has no `platform_admin_identities`
   * row for that generic callback branch to find. Completes at the shared callback via `OAuthIntent.ADMIN_INVITE`.
   */
  @Get(RouteNames.INVITE_GOOGLE)
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiInviteGoogleAuthorize()
  async inviteGoogleAuthorize(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const redirect = await this.platformAdminAuthService.buildAdminInviteGoogleRedirect(token);

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
}
