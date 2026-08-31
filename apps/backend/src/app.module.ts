import { DEFAULT_JOB_OPTIONS, QueuePrefix } from '@bg/constants/job.constant';
import { QueueUIModule } from '@bg/queue-ui.module';
import { AuditModule } from '@common/audit/audit.module';
import { RouteNames } from '@common/route-names';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import { EnvConfigModule } from '@config/env-config.module';
import { EnvConfig } from '@config/env.config';
import { DBModule } from '@db/db.module';
import { EmailModule } from '@email/email.module';
import { HealthModule } from '@health/health.module';
import { HttpLoggingInterceptor } from '@interceptors/logging.interceptor';
import { TransformInterceptor } from '@interceptors/transform.interceptor';
import { LoggerModule } from '@logger/logger.module';
import { MetricsModule } from '@metrics/metrics.module';
import { CookieAuthMiddleware } from '@middlewares/cookies.middleware';
import { DevToolsMiddleware } from '@middlewares/dev-tool.middleware';
import { MetricsMiddleware } from '@middlewares/metrics.middleware';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
// import { DevtoolsModule } from '@nestjs/devtools-integration';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { OtelModule } from '@otel/otel.module';
import { RedisModule } from '@redis/redis.module';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { redisStore } from 'cache-manager-redis-store';
import { Redis } from 'ioredis';

import { AgentsModule } from './ai/agents/agents.module';
import { DevToolsModule } from './api/dev-tools/dev-tools.module';
import { TracingModule } from './api/tracing/tracing.module';
// Auth & Users
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { GatewayModule } from './gateway/gateway.module';
import { MediaModule } from './media/media.module';
// Notifications
import { NotificationsModule } from './notifications/notifications.module';
// SMS
import { SmsModule } from './sms/sms.module';
import { UsersV2Module } from './users/users-v2.module';
import { UsersModule } from './users/users.module';
// Webhooks
import { WebhooksModule } from './webhooks/webhooks.module';

const configService = new ConfigService<EnvConfig>();

// Queue module
const queueModule = BullModule.forRootAsync({
  imports: [RedisModule],
  useFactory: (redisClient: Redis) => {
    return {
      prefix: QueuePrefix.SYSTEM, // For grouping queues
      connection: redisClient.options,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };
  },
  inject: [REDIS_CLIENT],
});

// Rate Limiting
const rateLimit = ThrottlerModule.forRoot([
  {
    name: 'short',
    ttl: 1 * 60, // Time to live in seconds (1 minute)
    limit: 30, // Maximum number of requests within the ttl
  },
  {
    name: 'medium',
    ttl: 5 * 60, // 5 minutes
    limit: 100,
  },
  {
    name: 'long',
    ttl: 30 * 60, // 30 minutes
    limit: 500,
  },
  {
    name: 'very-long',
    ttl: 60 * 60, // 1 hour
    limit: 1000,
  },
]);

// Cache Module
const cacheModule = CacheModule.registerAsync({
  useFactory: async () => {
    const store = await redisStore({
      socket: {
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
      },
    });

    return {
      store,
      ttl: 5 * 60000, // Default - 5 minutes (milliseconds)
    };
  },
  isGlobal: true,
});

@Module({
  imports: [
    // DevtoolsModule.register({
    //   http: process.env['NODE_ENV'] !== 'production',
    // }),
    rateLimit,
    cacheModule,
    EnvConfigModule,
    LoggerModule,
    EventEmitterModule.forRoot(),
    RedisModule,
    DBModule,
    OtelModule,
    queueModule,
    QueueUIModule,

    // Auth & Users
    AuthModule,
    UsersModule,
    UsersV2Module,

    // Media
    MediaModule,

    // SMS
    SmsModule,

    // Email
    EmailModule,

    // Notifications
    NotificationsModule,

    // AI Agents
    AgentsModule,

    // Webhooks
    WebhooksModule,

    // Common
    AuditModule,

    // Real-time
    GatewayModule,

    // APIs
    MetricsModule,
    HealthModule,
    DevToolsModule,
    TracingModule,
  ],
  providers: [
    ErrorHandlerService,
    DevToolsMiddleware,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    // Guard order: ThrottlerGuard → JwtAuthGuard → RolesGuard → PermissionsGuard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply to all routes
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(CookieAuthMiddleware).forRoutes('*');
    consumer
      .apply(DevToolsMiddleware)
      .forRoutes(
        RouteNames.DEV_TOOLS,
        `${RouteNames.HEALTH}/${RouteNames.HEALTH_UI}`,
        RouteNames.QUEUES_UI,
        RouteNames.API_DOCS
      );
  }
}
