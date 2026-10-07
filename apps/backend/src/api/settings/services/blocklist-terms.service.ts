import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import { MAX_BLOCKLIST_TERMS_PER_TENANT } from '../constants/settings.constants';
import {
  BlocklistTermDto,
  BlocklistTermListResponseDto,
  DeleteBlocklistTermResponseDto,
} from '../dto/blocklist-term-response.dto';
import {
  BlocklistLimitReachedException,
  BlocklistTermExistsException,
  BlocklistTermNotFoundException,
} from '../exceptions/settings.exceptions';

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
    const result = await this.settingsDbService.insertBlocklistTerm({
      tenantId: tenantUser.tenantId,
      term,
      maxTerms: MAX_BLOCKLIST_TERMS_PER_TENANT,
    });
    if (result.outcome === 'duplicate') {
      throw new BlocklistTermExistsException();
    }
    if (result.outcome === 'limit_reached') {
      throw new BlocklistLimitReachedException();
    }
    return BlocklistTermDto.from(result.record);
  }

  async remove(user: AuthUser, id: string): Promise<DeleteBlocklistTermResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    const deleted = await this.settingsDbService.deleteBlocklistTerm({
      id,
      tenantId: tenantUser.tenantId,
    });
    if (!deleted) {
      throw new BlocklistTermNotFoundException();
    }
    return DeleteBlocklistTermResponseDto.from(id, MESSAGES.SETTINGS.BLOCKLIST_TERM_REMOVED);
  }
}
