import { AiModule } from '@ai/ai.module';
import { ACCESS_TOKEN_TTL_SECONDS } from '@auth/constants/auth.constants';
import { DEFAULT_JOB_OPTIONS, QueuePrefix } from '@bg/constants/job.constant';
import { QueueUIModule } from '@bg/queue-ui.module';
import { THROTTLER_TIERS } from '@common/constants/throttle.constants';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import { EnvConfigModule } from '@config/env-config.module';
import { EnvConfig } from '@config/env.config';
import { DBModule } from '@db/db.module';
import { EmailModule } from '@email/email.module';
import { HealthModule } from '@health/health.module';
import { HttpLoggingInterceptor } from '@interceptors/logging.interceptor';
import { TransformInterceptor } from '@interceptors/transform.interceptor';
import { LoggerModule } from '@logger/logger.module';
import { MediaModule } from '@media/media.module';
import { MetricsModule } from '@metrics/metrics.module';
import { MetricsMiddleware } from '@middlewares/metrics.middleware';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { OtelModule } from '@otel/otel.module';
import { PromptsModule } from '@prompts/prompts.module';
import { RedisModule } from '@redis/redis.module';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { ReviewPipelineModule } from '@review-pipeline/review-pipeline.module';
import { ReviewProviderModule } from '@review-provider/review-provider.module';
import { redisStore } from 'cache-manager-redis-store';
import { Redis } from 'ioredis';

import { AdminModule } from './api/admin/admin.module';
import { AuthModule } from './api/auth/auth.module';
import { JwtAuthGuard } from './api/auth/guards/jwt-auth.guard';
import { RolesGuard } from './api/auth/guards/roles.guard';
import { BillingModule } from './api/billing/billing.module';
import { FreePlanCapModule } from './api/billing/free-plan-cap.module';
import { ConnectionsModule } from './api/connections/connections.module';
import { DashboardModule } from './api/dashboard/dashboard.module';
import { DevToolsModule } from './api/dev-tools/dev-tools.module';
import { NotificationsModule } from './api/notifications/notifications.module';
import { ReviewsModule } from './api/reviews/reviews.module';
import { SettingsModule } from './api/settings/settings.module';
import { TracingModule } from './api/tracing/tracing.module';

const configService = new ConfigService<EnvConfig>();

const queueModule = BullModule.forRootAsync({
  imports: [RedisModule],
  useFactory: (redisClient: Redis) => {
    return {
      prefix: QueuePrefix.SYSTEM,
      connection: redisClient.options,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };
  },
  inject: [REDIS_CLIENT],
});

// `ttl` is in milliseconds (@nestjs/throttler >= 5); seconds would make the window 60 ms and leave unannotated routes effectively unthrottled.
const MINUTE_MS = 60 * 1000;
const rateLimit = ThrottlerModule.forRoot([
  {
    name: THROTTLER_TIERS.SHORT,
    ttl: MINUTE_MS,
    limit: 30,
  },
  {
    name: THROTTLER_TIERS.MEDIUM,
    ttl: 5 * MINUTE_MS,
    limit: 100,
  },
  {
    name: THROTTLER_TIERS.LONG,
    ttl: 30 * MINUTE_MS,
    limit: 500,
  },
  {
    name: THROTTLER_TIERS.VERY_LONG,
    ttl: 60 * MINUTE_MS,
    limit: 1000,
  },
]);

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
      ttl: 5 * 60000, // milliseconds
    };
  },
  isGlobal: true,
});

@Module({
  imports: [
    rateLimit,
    cacheModule,
    EnvConfigModule,
    LoggerModule,
    EventEmitterModule.forRoot(),
    RedisModule,
    DashboardModule,
    DBModule,
    OtelModule,
    queueModule,
    QueueUIModule,

    // For DevToolsMiddleware. Registered here, not reused from AuthModule: an AppModule-level provider resolves JwtService from AppModule's own imports.
    JwtModule.registerAsync({
      useFactory: (config: ConfigService<EnvConfig>) => ({
        secret: config.get<string>('JWT_SECRET') ?? '',
        signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      }),
      inject: [ConfigService],
    }),

    AuthModule,
    EmailModule,
    ReviewProviderModule,
    ReviewPipelineModule,
    ConnectionsModule,
    ReviewsModule,
    MetricsModule,
    HealthModule,
    DevToolsModule,
    TracingModule,
    PromptsModule,
    AiModule,
    SettingsModule,
    NotificationsModule,
    AdminModule,
    BillingModule,
    FreePlanCapModule,
    // Registered explicitly, not via AuthModule's import: dropping that import would silently unmount the avatar routes (404s, no compile error).
    MediaModule,
  ],
  providers: [
    ErrorHandlerService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    // Order matters: ThrottlerGuard, JwtAuthGuard, RolesGuard.
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
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');

    // The ops-tools guard isn't applied here: Bull Board is an Express sub-app a MiddlewareConsumer can't reach (see createOpsToolsGuard in bootstrap.ts).
  }
}
