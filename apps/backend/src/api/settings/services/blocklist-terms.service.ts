import { MESSAGES } from '@common/constants/messages.constants';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { JwtTokenType } from '../../auth/enums/jwt-token-type.enum';
import type { AuthUser, TenantAuthUser } from '../../auth/types/auth-user.type';
import {
  BlocklistTermDto,
  BlocklistTermListResponseDto,
  DeleteBlocklistTermResponseDto,
} from '../dto/blocklist-term-response.dto';

@Injectable()
export class BlocklistTermsService {
  constructor(private readonly settingsDbService: SettingsDbService) {}

  async list(user: AuthUser): Promise<BlocklistTermListResponseDto> {
    const tenantUser = this.requireTenantUser(user);
    const rows = await this.settingsDbService.listBlocklistTerms(tenantUser.tenantId);
    return BlocklistTermListResponseDto.from(rows);
  }

  async create(user: AuthUser, term: string): Promise<BlocklistTermDto> {
    const tenantUser = this.requireTenantUser(user);
    const row = await this.settingsDbService.insertBlocklistTerm(tenantUser.tenantId, term);
    if (row === null) {
      throw new ConflictException(MESSAGES.SETTINGS.BLOCKLIST_TERM_EXISTS);
    }
    return BlocklistTermDto.from(row);
  }

  async remove(user: AuthUser, id: string): Promise<DeleteBlocklistTermResponseDto> {
    const tenantUser = this.requireTenantUser(user);
    const deleted = await this.settingsDbService.deleteBlocklistTerm(id, tenantUser.tenantId);
    if (!deleted) {
      throw new NotFoundException(MESSAGES.SETTINGS.BLOCKLIST_TERM_NOT_FOUND);
    }
    return DeleteBlocklistTermResponseDto.from(id, MESSAGES.SETTINGS.BLOCKLIST_TERM_REMOVED);
  }

  private requireTenantUser(user: AuthUser): TenantAuthUser {
    if (user.type !== JwtTokenType.TENANT_USER) {
      throw new ForbiddenException(MESSAGES.SETTINGS.TENANT_ONLY);
    }
    return user;
  }
}
