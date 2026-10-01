import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type { AuthUser } from '../../auth/types/auth.type';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { TenantMemberResponseDto } from '../dto/tenant-member-response.dto';
import { TenantMembersService } from '../services/tenant-members.service';
import {
  ApiCancelMemberRemoval,
  ApiInviteMember,
  ApiListTenantMembers,
  ApiRequestMemberRemoval,
  ApiRevokeMemberInvite,
} from '../swagger/tenant-members.swagger';

@Controller({ path: `${RouteNames.SETTINGS}/${RouteNames.MEMBERS}`, version: '1' })
@ApiTags('Settings')
@Roles(UserRole.OWNER)
export class TenantMembersController {
  constructor(private readonly tenantMembersService: TenantMembersService) {}

  @Get()
  @ApiListTenantMembers()
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponse<TenantMemberResponseDto[]>> {
    const result = await this.tenantMembersService.listMembers(user);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Post()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiInviteMember()
  async invite(
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteMemberDto
  ): Promise<ApiResponse<TenantMemberResponseDto>> {
    const result = await this.tenantMembersService.sendInvite(user, dto);
    return ResponseUtil.success(result, MESSAGES.SETTINGS.MEMBER_INVITE_SENT, HttpStatus.CREATED);
  }

  @Delete(RouteNames.MEMBER_BY_ID)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiRevokeMemberInvite()
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('memberId', ParseUUIDPipe) memberId: string
  ): Promise<ApiResponse<{ message: string }>> {
    await this.tenantMembersService.revokeInvite(user, memberId);
    return ResponseUtil.success(
      { message: MESSAGES.SETTINGS.MEMBER_INVITE_REVOKED },
      MESSAGES.SETTINGS.MEMBER_INVITE_REVOKED,
      HttpStatus.OK
    );
  }

  @Post(RouteNames.MEMBER_REQUEST_REMOVAL)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiRequestMemberRemoval()
  async requestRemoval(
    @CurrentUser() user: AuthUser,
    @Param('memberId', ParseUUIDPipe) memberId: string
  ): Promise<ApiResponse<{ message: string }>> {
    const { gracePeriodDays } = await this.tenantMembersService.requestRemoval(user, memberId);
    const message = MESSAGES.SETTINGS.MEMBER_REMOVAL_REQUESTED(gracePeriodDays);
    return ResponseUtil.success({ message }, message, HttpStatus.OK);
  }

  @Post(RouteNames.MEMBER_CANCEL_REMOVAL)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiCancelMemberRemoval()
  async cancelRemoval(
    @CurrentUser() user: AuthUser,
    @Param('memberId', ParseUUIDPipe) memberId: string
  ): Promise<ApiResponse<{ message: string }>> {
    await this.tenantMembersService.cancelRemoval(user, memberId);
    return ResponseUtil.success(
      { message: MESSAGES.SETTINGS.MEMBER_REMOVAL_CANCELLED },
      MESSAGES.SETTINGS.MEMBER_REMOVAL_CANCELLED,
      HttpStatus.OK
    );
  }
}
