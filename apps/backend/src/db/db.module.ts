import { DBService } from '@db/db.service';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Repositories — centralized data access layer
import { AgentsRepository } from './repositories/ai/agents.repository';
import { RagRepository } from './repositories/ai/rag.repository';
import { ApiKeyRepository } from './repositories/auth/api-key.repository';
import { AuthRepository } from './repositories/auth/auth.repository';
import { MfaRepository } from './repositories/auth/mfa.repository';
import { OAuthRepository } from './repositories/auth/oauth.repository';
import { TokenRepository } from './repositories/auth/token.repository';
import { AuditRepository } from './repositories/common/audit.repository';
import { MediaRepository } from './repositories/media/media.repository';
import { NotificationsRepository } from './repositories/notifications/notifications.repository';
import { UsersRepository } from './repositories/users/users.repository';
import { WebhooksRepository } from './repositories/webhooks/webhooks.repository';

const repositories = [
  AuthRepository,
  TokenRepository,
  MfaRepository,
  ApiKeyRepository,
  OAuthRepository,
  UsersRepository,
  MediaRepository,
  NotificationsRepository,
  AgentsRepository,
  RagRepository,
  AuditRepository,
  WebhooksRepository,
];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DBService, ...repositories],
  exports: [DBService, ...repositories],
})
export class DBModule {}
