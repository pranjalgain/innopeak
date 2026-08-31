import { UsersRepository } from '@db/repositories/users/users.repository';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserProfile } from './interfaces/user.interface';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let target: UsersService;
  let usersRepository: jest.Mocked<UsersRepository>;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    target = module.get(UsersService);
    usersRepository = module.get(UsersRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getProfile', () => {
    it('returns the user profile when found', async () => {
      const profile = buildUserProfile();
      usersRepository.findById.mockResolvedValue(profile);

      const result = await target.getProfile('user-1');

      expect(result).toEqual(profile);
      expect(usersRepository.findById).toHaveBeenCalledWith('user-1');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(target.getProfile('missing-user')).rejects.toThrow(NotFoundException);
      expect(usersRepository.findById).toHaveBeenCalledWith('missing-user');
    });
  });

  describe('findAll', () => {
    it('delegates pagination params to the repository and returns the result', async () => {
      const repoResult = { data: [buildUserProfile()], total: 1 };
      usersRepository.findAll.mockResolvedValue(repoResult);

      const result = await target.findAll(2, 10);

      expect(result).toEqual(repoResult);
      expect(usersRepository.findAll).toHaveBeenCalledWith(2, 10);
    });

    it('returns an empty page when the repository has no results', async () => {
      usersRepository.findAll.mockResolvedValue({ data: [], total: 0 });

      const result = await target.findAll(1, 20);

      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('updateProfile', () => {
    it('builds a partial update payload from only the defined dto fields', async () => {
      const dto: UpdateUserDto = { firstName: 'Janet' };
      const updated = buildUserProfile({ firstName: 'Janet' });
      usersRepository.update.mockResolvedValue(updated);

      const result = await target.updateProfile('user-1', dto);

      expect(usersRepository.update).toHaveBeenCalledWith('user-1', { firstName: 'Janet' });
      expect(result).toEqual(updated);
    });

    it('includes all provided fields (firstName, lastName, phone) in the update payload', async () => {
      const dto: UpdateUserDto = { firstName: 'Janet', lastName: 'Smith', phone: '+123456' };
      const updated = buildUserProfile(dto);
      usersRepository.update.mockResolvedValue(updated);

      await target.updateProfile('user-1', dto);

      expect(usersRepository.update).toHaveBeenCalledWith('user-1', {
        firstName: 'Janet',
        lastName: 'Smith',
        phone: '+123456',
      });
    });

    it('throws NotFoundException when the repository cannot find the user to update', async () => {
      usersRepository.update.mockResolvedValue(null);

      await expect(target.updateProfile('missing-user', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateUser', () => {
    it('soft deletes the user when it exists', async () => {
      usersRepository.findById.mockResolvedValue(buildUserProfile());
      usersRepository.softDelete.mockResolvedValue(undefined);

      await target.deactivateUser('user-1');

      expect(usersRepository.softDelete).toHaveBeenCalledWith('user-1');
    });

    it('throws NotFoundException and does not call softDelete when the user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(target.deactivateUser('missing-user')).rejects.toThrow(NotFoundException);
      expect(usersRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});
