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
  GOOGLE_AUTH_STATE_TTL_SECONDS,
} from './constants/google-auth.constants';
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
 * Platform-admin authentication — its own controller, its own route namespace
 * (`/v1/admin/auth/*`), entirely public (the caller has no session yet by definition). Split out
 * from the shared `AuthController` so admin login has nothing left to disambiguate — see
 * `apps/documentation/docs/backend/auth/separate-admin-login-design.md`.
 *
 * Deliberately not under `RouteNames.ADMIN_SETTINGS` — that path is `@Roles(PLATFORM_ADMIN)`-gated
 * and requires the caller to already *be* one, which is exactly backwards for a login/invite-accept
 * surface.
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
   * The Google button on the admin sign-in screen. An admin who accepted their invite through
   * Google has no password, so the form above can never sign them in — this is their way back.
   * Its own intent rather than the tenant `GET /v1/auth/google`, so the admin screen can never
   * resolve to a tenant session and its failures never land on the tenant login page.
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
      buildCookieOptions(GOOGLE_AUTH_SID_COOKIE_PATH, GOOGLE_AUTH_STATE_TTL_SECONDS)
    );
    res.redirect(HttpStatus.FOUND, redirect.authorizationUrl);
  }

  /**
   * Read-only preview so the accept screen can show "You've been invited as `<email>`" before
   * ever asking for a password. `@Public()` — the invitee has no session yet.
   */
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

  /**
   * The password path for accepting a platform-admin invite. Signs the admin in immediately on
   * success, same as `login` above.
   */
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
   * The SSO alternative to `acceptAdminInvite` — deliberately its own route, not
   * `GET /v1/auth/google`, since a first-time invitee has no `platform_admin_identities` row yet
   * for that generic callback branch to find. Completion happens at the shared
   * `GET /v1/auth/google/callback` (still on `AuthController`) via `OAuthIntent.ADMIN_INVITE`.
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

    // Same binding cookie every entry point into the shared Google callback sets — one cookie
    // name, one purpose, regardless of which controller starts the round trip.
    res.cookie(
      GOOGLE_AUTH_SID_COOKIE_NAME,
      redirect.sid,
      buildCookieOptions(GOOGLE_AUTH_SID_COOKIE_PATH, GOOGLE_AUTH_STATE_TTL_SECONDS)
    );
    res.redirect(HttpStatus.FOUND, redirect.authorizationUrl);
  }
}
