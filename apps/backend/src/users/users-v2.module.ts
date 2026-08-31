import { Module } from '@nestjs/common';

import { UsersV2Controller } from './users-v2.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersV2Controller],
  providers: [UsersService],
})
export class UsersV2Module {}
