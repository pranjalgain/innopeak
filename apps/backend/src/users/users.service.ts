import { UsersRepository } from '@db/repositories/users/users.repository';
import { Injectable, NotFoundException } from '@nestjs/common';

import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfile } from './interfaces/user.interface';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findAll(page: number, pageSize: number): Promise<{ data: UserProfile[]; total: number }> {
    return this.usersRepository.findAll(page, pageSize);
  }

  async updateProfile(userId: string, dto: UpdateUserDto): Promise<UserProfile> {
    const updateData: Partial<{ firstName: string; lastName: string; phone: string }> = {};

    if (dto.firstName !== undefined) {
      updateData.firstName = dto.firstName;
    }

    if (dto.lastName !== undefined) {
      updateData.lastName = dto.lastName;
    }

    if (dto.phone !== undefined) {
      updateData.phone = dto.phone;
    }

    const user = await this.usersRepository.update(userId, updateData);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async deactivateUser(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersRepository.softDelete(userId);
  }
}
