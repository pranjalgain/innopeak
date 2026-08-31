import { DBModule } from '@db/db.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmPushProvider } from './providers/fcm.provider';
import { PushProvider } from './providers/push.provider';

@Module({
  imports: [ConfigModule, DBModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: PushProvider,
      useClass: FcmPushProvider,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
