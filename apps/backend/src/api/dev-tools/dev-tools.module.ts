import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';

import { join } from 'path';

import { DevToolsController } from './dev-tools.controller';
import { SqsQueueStatusService } from './services/sqs-queue-status.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'views'),
      renderPath: '/dev-tools',
    }),
  ],
  controllers: [DevToolsController],
  providers: [SqsQueueStatusService],
})
export class DevToolsModule {}
