import { EnvConfig } from '@config/env.config';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { SmsProviderType } from './interfaces/sms.interface';
import { SmsProvider } from './providers/sms.provider';
import { SnsSmsProvider } from './providers/sns.provider';
import { TwilioSmsProvider } from './providers/twilio.provider';
import { SmsService } from './sms.service';

const logger = new Logger('SmsModule');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SmsProvider,
      useFactory: (configService: ConfigService<EnvConfig>): SmsProvider => {
        const providerName = (configService.get<string>('SMS_PROVIDER' as keyof EnvConfig) ??
          'twilio') as SmsProviderType;

        logger.log(`Initializing SMS provider: ${providerName}`);

        switch (providerName) {
          case 'sns':
            return new SnsSmsProvider(configService);
          case 'twilio':
          default:
            return new TwilioSmsProvider(configService);
        }
      },
      inject: [ConfigService],
    },
    SmsService,
  ],
  exports: [SmsService, SmsProvider],
})
export class SmsModule {}
