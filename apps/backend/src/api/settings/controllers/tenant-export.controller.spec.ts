import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { Test } from '@nestjs/testing';

import { Readable } from 'stream';

import { TenantExportController } from './tenant-export.controller';

import { TenantExportService } from '../services/tenant-export.service';

describe('TenantExportController', () => {
  const user: AuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'jane@acme.test',
    role: UserRole.OWNER,
    locale: null,
  };

  async function build(stream: Readable): Promise<TenantExportController> {
    const moduleRef = await Test.createTestingModule({
      controllers: [TenantExportController],
      providers: [
        {
          provide: TenantExportService,
          useValue: { exportData: jest.fn().mockResolvedValue({ stream, filename: 'x.json' }) },
        },
      ],
    }).compile();
    return moduleRef.get(TenantExportController);
  }

  it('returns the file as an attachment under the server-chosen name', async () => {
    const file = await (await build(Readable.from(['{}']))).exportData(user);

    expect(file.getHeaders().disposition).toBe('attachment; filename="x.json"');
  });

  it('destroys the connection when the stream fails mid-way, instead of ending it as if complete', async () => {
    const file = await (await build(Readable.from(['{}']))).exportData(user);
    const res = { destroy: jest.fn() };
    const error = new Error('statement timeout');

    file.errorHandler(error, res as never);

    expect(res.destroy).toHaveBeenCalledWith(error);
  });
});
