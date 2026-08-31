import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService): Redis => {
    const redisHost = configService.get<string>('REDIS_HOST');
    const redisPort = configService.get<number>('REDIS_PORT');
    const redisPassword = configService.get<string>('REDIS_PASSWORD');
    const redisTlsEnabled = configService.get<boolean>('REDIS_TLS_ENABLED');

    const config: RedisOptions = {
      host: redisHost ?? 'localhost',
      port: redisPort ?? 6379,
      maxRetriesPerRequest: null,
    };

    if (redisPassword) {
      config.password = redisPassword;
    }

    if (redisTlsEnabled) {
      config.tls = {};
    }

    return new Redis(config);
  },
  inject: [ConfigService],
};
