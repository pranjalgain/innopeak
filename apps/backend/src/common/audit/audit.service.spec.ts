import { AuditRepository } from '@db/repositories/common/audit.repository';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';

import { AuditService } from './audit.service';

describe('AuditService', () => {
  let target: AuditService;
  let auditRepository: jest.Mocked<AuditRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: AuditRepository, useValue: { create: jest.fn() } }],
    }).compile();
    target = module.get(AuditService);
    auditRepository = module.get(AuditRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('log', () => {
    it('persists an audit log record via the repository', async () => {
      auditRepository.create.mockResolvedValue(undefined);

      await target.log({
        requestedApi: '/v1/users',
        operationType: 'INSERT',
        severity: 'LOW',
        description: 'created a user',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(auditRepository.create).toHaveBeenCalledWith({
        requestedApi: '/v1/users',
        operationType: 'INSERT',
        severity: 'LOW',
        description: 'created a user',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });
    });

    it('swallows repository errors and logs them instead of throwing', async () => {
      auditRepository.create.mockRejectedValue(new Error('db down'));

      await expect(
        target.log({
          requestedApi: '/v1/users',
          operationType: 'DELETE',
          severity: 'CRITICAL',
          description: 'deleted a user',
        })
      ).resolves.toBeUndefined();

      expect(auditRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('logUserAction', () => {
    it('extracts ip and user agent from the request when provided', async () => {
      auditRepository.create.mockResolvedValue(undefined);
      const request = {
        ip: '10.0.0.1',
        socket: { remoteAddress: '10.0.0.2' },
        headers: { 'user-agent': 'test-agent' },
      } as unknown as Request;

      await target.logUserAction('user-1', 'VIEW_PROFILE', 'viewed own profile', request);

      expect(auditRepository.create).toHaveBeenCalledWith({
        requestedApi: 'VIEW_PROFILE',
        operationType: 'VIEW',
        severity: 'LOW',
        description: 'viewed own profile',
        ipAddress: '10.0.0.1',
        userAgent: 'test-agent',
        userId: 'user-1',
      });
    });

    it('falls back to socket.remoteAddress when request.ip is missing', async () => {
      auditRepository.create.mockResolvedValue(undefined);
      const request = {
        ip: undefined,
        socket: { remoteAddress: '10.0.0.9' },
        headers: {},
      } as unknown as Request;

      await target.logUserAction('user-2', 'VIEW_PROFILE', 'viewed own profile', request);

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '10.0.0.9', userAgent: undefined })
      );
    });

    it('handles a missing request object gracefully', async () => {
      auditRepository.create.mockResolvedValue(undefined);

      await target.logUserAction('user-3', 'VIEW_PROFILE', 'viewed own profile');

      expect(auditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: undefined, userAgent: undefined })
      );
    });

    it('swallows repository errors and logs them instead of throwing', async () => {
      auditRepository.create.mockRejectedValue(new Error('db down'));

      await expect(
        target.logUserAction('user-4', 'VIEW_PROFILE', 'viewed own profile')
      ).resolves.toBeUndefined();
    });
  });
});
