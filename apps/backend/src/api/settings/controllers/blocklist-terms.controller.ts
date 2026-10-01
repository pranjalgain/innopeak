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

import type { AuthUser } from '../../auth/types/auth.type';
import {
  BlocklistTermDto,
  BlocklistTermListResponseDto,
  DeleteBlocklistTermResponseDto,
} from '../dto/blocklist-term-response.dto';
import { CreateBlocklistTermDto } from '../dto/create-blocklist-term.dto';
import { BlocklistTermsService } from '../services/blocklist-terms.service';
import {
  ApiCreateBlocklistTerm,
  ApiDeleteBlocklistTerm,
  ApiListBlocklistTerms,
} from '../swagger/blocklist-terms.swagger';

@Controller({
  path: `${RouteNames.SETTINGS}/${RouteNames.BLOCKLIST_TERMS}`,
  version: '1',
})
@ApiTags('Settings')
@Roles(UserRole.OWNER)
export class BlocklistTermsController {
  constructor(private readonly blocklistTermsService: BlocklistTermsService) {}

  @Get()
  @ApiListBlocklistTerms()
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponse<BlocklistTermListResponseDto>> {
    const result = await this.blocklistTermsService.list(user);
    return ResponseUtil.success(result, MESSAGES.SETTINGS.BLOCKLIST_LISTED);
  }

  @Post()
  @ApiCreateBlocklistTerm()
  async create(
    @Body() dto: CreateBlocklistTermDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<BlocklistTermDto>> {
    const result = await this.blocklistTermsService.create(user, dto.term);
    return ResponseUtil.success(
      result,
      MESSAGES.SETTINGS.BLOCKLIST_TERM_CREATED,
      HttpStatus.CREATED
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiDeleteBlocklistTerm()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<DeleteBlocklistTermResponseDto>> {
    const result = await this.blocklistTermsService.remove(user, id);
    return ResponseUtil.success(result, result.message);
  }
}
