import { DBService } from '@db/db.service';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Repositories — centralized data access layer
import { AuthDbService } from './repositories/auth/auth.db-service';
import { AuthRepository } from './repositories/auth/auth.repository';

const repositories = [AuthRepository, AuthDbService];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DBService, ...repositories],
  exports: [DBService, ...repositories],
})
export class DBModule {}
