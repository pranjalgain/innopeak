import { DBService } from '@db/db.service';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Repositories — centralized data access layer
import { AuthDbService } from './repositories/auth/auth.db-service';
import { AuthRepository } from './repositories/auth/auth.repository';
import { PromptsDbService } from './repositories/prompts/prompts.db-service';
import { PromptsRepository } from './repositories/prompts/prompts.repository';

const repositories = [AuthRepository, AuthDbService, PromptsRepository, PromptsDbService];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DBService, ...repositories],
  exports: [DBService, ...repositories],
})
export class DBModule {}
