import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Public } from '@auth/decorators/public.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { UserRole } from '@auth/enums/user-role.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import {
  DEFAULT_RETURN_TO,
  OAUTH_SID_COOKIE_NAME,
  OAUTH_SID_COOKIE_PATH,
} from '../constants/connections.constants';
import {
  AuthorizeQueryDto,
  ConfirmLocationDto,
  ListLocationsQueryDto,
  SetActiveLocationDto,
} from '../dto/connection-request.dto';
import type {
  AvailableLocationsResponseDto,
  ConfirmLocationsResponseDto,
  ConnectionStatusResponseDto,
  DisconnectResponseDto,
  LocationDto,
  LocationListResponseDto,
} from '../dto/connection-response.dto';
import { ConnectionsService } from '../services/connections.service';
import {
  ApiAuthorize,
  ApiAvailableLocations,
  ApiCallback,
  ApiConfirmLocation,
  ApiDisconnect,
  ApiGetConnection,
  ApiListLocations,
  ApiSetActiveLocation,
} from '../swagger/connections.swagger';
import { buildOauthSidCookieOptions } from '../utils/connections.utils';

@Controller({ path: RouteNames.CONNECTIONS, version: '1' })
@ApiTags('Connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  @ApiGetConnection()
  async getConnection(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponseDto<ConnectionStatusResponseDto>> {
    const response = await this.connectionsService.getConnectionStatus(user);
    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.GOOGLE_AUTHORIZE)
  @Roles(UserRole.OWNER)
  @ApiAuthorize()
  async authorize(
    @CurrentUser() user: AuthUser,
    @Query() query: AuthorizeQueryDto,
    @Res() res: Response
  ): Promise<void> {
    const { authorizationUrl, sid } = await this.connectionsService.buildAuthorizeRedirect({
      user,
      returnTo: query.returnTo ?? DEFAULT_RETURN_TO,
    });

    res.cookie(OAUTH_SID_COOKIE_NAME, sid, buildOauthSidCookieOptions());
    res.redirect(HttpStatus.FOUND, authorizationUrl);
  }

  /**
   * `@Public()` because Google — not the SPA — performs this request and it carries no bearer
   * token. All tenant context comes from the signed `state` plus the Redis record it names.
   */
  @Get(RouteNames.GOOGLE_CALLBACK)
  @Public()
  @ApiCallback()
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const query = req.query as Record<string, string | undefined>;

    const redirectUrl = await this.connectionsService.handleCallback({
      code: query['code'],
      state: query['state'],
      error: query['error'],
      sid: (req.cookies as Record<string, string | undefined> | undefined)?.[OAUTH_SID_COOKIE_NAME],
    });

    // Cleared unconditionally, success or failure: the binding cookie is single-use by design, so
    // leaving it behind would let an abandoned flow's cookie satisfy a later callback's check.
    res.clearCookie(OAUTH_SID_COOKIE_NAME, { path: OAUTH_SID_COOKIE_PATH });
    res.redirect(HttpStatus.FOUND, redirectUrl);
  }

  @Delete(RouteNames.GOOGLE)
  @Roles(UserRole.OWNER)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiDisconnect()
  async disconnect(@CurrentUser() user: AuthUser): Promise<ApiResponseDto<DisconnectResponseDto>> {
    const response = await this.connectionsService.disconnect(user);
    return ResponseUtil.success(response, MESSAGES.CONNECTIONS.DISCONNECTED, HttpStatus.OK);
  }

  @Get(RouteNames.GOOGLE_AVAILABLE_LOCATIONS)
  @Roles(UserRole.OWNER)
  @ApiAvailableLocations()
  async availableLocations(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponseDto<AvailableLocationsResponseDto>> {
    const response = await this.connectionsService.listAvailableLocations(user);
    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.LOCATIONS)
  @ApiListLocations()
  async listLocations(
    @CurrentUser() user: AuthUser,
    @Query() query: ListLocationsQueryDto
  ): Promise<ApiResponseDto<LocationListResponseDto>> {
    const response = await this.connectionsService.listLocations({
      user,
      status: query.status,
    });

    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.LOCATIONS)
  @Roles(UserRole.OWNER)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiConfirmLocation()
  async confirmLocation(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmLocationDto
  ): Promise<ApiResponseDto<ConfirmLocationsResponseDto>> {
    const response = await this.connectionsService.confirmLocations({
      user,
      externalLocationIds: dto.externalLocationIds,
    });

    return ResponseUtil.success(
      response,
      MESSAGES.CONNECTIONS.LOCATION_CONFIRMED,
      HttpStatus.CREATED
    );
  }

  /**
   * The tenant-wide "currently viewing" business, shown on the Dashboard/Review Queue and in a
   * Business Switcher. `@Roles(OWNER)`: this changes what every member of the tenant sees, so
   * only an owner may switch it — a member's own view is read-only.
   */
  @Patch(RouteNames.ACTIVE_LOCATION)
  @Roles(UserRole.OWNER)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiSetActiveLocation()
  async setActiveLocation(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetActiveLocationDto
  ): Promise<ApiResponseDto<LocationDto>> {
    const response = await this.connectionsService.setActiveLocation({
      user,
      locationId: dto.locationId,
    });

    return ResponseUtil.success(
      response,
      MESSAGES.CONNECTIONS.ACTIVE_LOCATION_UPDATED,
      HttpStatus.OK
    );
  }
}
