import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth-user.type';
import {
  BlocklistTermDto,
  BlocklistTermListResponseDto,
  DeleteBlocklistTermResponseDto,
} from '../dto/blocklist-term-response.dto';

@Injectable()
export class BlocklistTermsService {
  constructor(private readonly settingsDbService: SettingsDbService) {}

  async list(user: AuthUser): Promise<BlocklistTermListResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    const rows = await this.settingsDbService.listBlocklistTerms(tenantUser.tenantId);
    return BlocklistTermListResponseDto.from(rows);
  }

  async create(user: AuthUser, term: string): Promise<BlocklistTermDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    const row = await this.settingsDbService.insertBlocklistTerm(tenantUser.tenantId, term);
    if (row === null) {
      throw new ConflictException(MESSAGES.SETTINGS.BLOCKLIST_TERM_EXISTS);
    }
    return BlocklistTermDto.from(row);
  }

  async remove(user: AuthUser, id: string): Promise<DeleteBlocklistTermResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    const deleted = await this.settingsDbService.deleteBlocklistTerm(id, tenantUser.tenantId);
    if (!deleted) {
      throw new NotFoundException(MESSAGES.SETTINGS.BLOCKLIST_TERM_NOT_FOUND);
    }
    return DeleteBlocklistTermResponseDto.from(id, MESSAGES.SETTINGS.BLOCKLIST_TERM_REMOVED);
  }
}
