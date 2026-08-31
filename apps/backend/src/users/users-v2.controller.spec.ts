import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { UserProfile } from './interfaces/user.interface';
import { UsersV2Controller } from './users-v2.controller';
import { UsersService } from './users.service';

import type { AuthUser } from '../auth/interfaces/auth-user.interface';

describe('UsersV2Controller', () => {
  let target: UsersV2Controller;
  let usersService: jest.Mocked<UsersService>;

  const buildUserProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    id: 'user-1',
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: null,
    isActive: true,
    isEmailVerified: true,
    mfaEnabled: false,
    roles: ['user'],
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  });

  const authUser: AuthUser = {
    id: 'user-1',
    email: 'jane@example.com',
    roles: ['user'],
    permissions: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersV2Controller],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findAll: jest.fn(),
            getProfile: jest.fn(),
            deactivateUser: jest.fn(),
          },
        },
      ],
    }).compile();

    target = module.get(UsersV2Controller);
    usersService = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('maps profiles to v2 response dtos including computed fullName', async () => {
      usersService.findAll.mockResolvedValue({ data: [buildUserProfile()], total: 1 });

      const result = await target.findAll(1, 20);

      expect(usersService.findAll).toHaveBeenCalledWith(1, 20);
      expect(result.data[0]).toMatchObject({ id: 'user-1', fullName: 'Jane Doe' });
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    it('handles users with a missing last name when computing fullName', async () => {
      usersService.findAll.mockResolvedValue({
        data: [buildUserProfile({ firstName: 'Jane', lastName: null })],
        total: 1,
      });

      const result = await target.findAll(1, 20);

      expect(result.data[0]?.fullName).toBe('Jane');
    });
  });

  describe('getMyProfile', () => {
    it('returns the current user profile as a v2 response dto', async () => {
      usersService.getProfile.mockResolvedValue(buildUserProfile());

      const result = await target.getMyProfile(authUser);

      expect(usersService.getProfile).toHaveBeenCalledWith('user-1');
      expect(result.fullName).toBe('Jane Doe');
    });
  });

  describe('findById', () => {
    it('delegates to the service and shapes the v2 response', async () => {
      usersService.getProfile.mockResolvedValue(buildUserProfile({ id: 'other-user' }));

      const result = await target.findById('other-user');

      expect(usersService.getProfile).toHaveBeenCalledWith('other-user');
      expect(result.id).toBe('other-user');
    });

    it('propagates errors thrown by the service (e.g. not found)', async () => {
      usersService.getProfile.mockRejectedValue(new Error('User not found'));

      await expect(target.findById('missing')).rejects.toThrow('User not found');
    });
  });

  describe('remove', () => {
    it('deactivates the user and returns a confirmation message', async () => {
      usersService.deactivateUser.mockResolvedValue(undefined);

      const result = await target.remove('user-1');

      expect(usersService.deactivateUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ message: 'User deactivated successfully' });
    });
  });
});
