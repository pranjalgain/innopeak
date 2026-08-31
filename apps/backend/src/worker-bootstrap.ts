import { LoggerService } from '@logger/logger.service';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // Enable graceful shutdown hooks (SIGTERM/SIGINT trigger onModuleDestroy)
  app.enableShutdownHooks();

  const logger = await app.resolve(LoggerService);
  logger.log('Worker process started and listening for jobs...');
}
