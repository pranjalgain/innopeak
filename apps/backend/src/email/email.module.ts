import { isProduction } from '@config/deployment-target.util';
import { EmailService } from '@email/email.service';
import { EmailProviderType } from '@email/interfaces/email.interface';
import { EmailProvider } from '@email/providers/email.provider';
import { NoopEmailProvider } from '@email/providers/noop.provider';
import { SesEmailProvider } from '@email/providers/ses.provider';
import { SmtpEmailProvider } from '@email/providers/smtp.provider';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('EmailModule');

const emailProviderFactory = {
  provide: EmailProvider,
  useFactory: (configService: ConfigService): EmailProvider => {
    // Non-production never actually sends, regardless of EMAIL_PROVIDER/SMTP_HOST — see
    // NoopEmailProvider. Real delivery is opt-in only by deploying with NODE_ENV=production.
    if (!isProduction()) {
      logger.log('Initializing email provider: noop (non-production — see NoopEmailProvider)');
      return new NoopEmailProvider();
    }

    const providerType =
      (configService.get<string>('EMAIL_PROVIDER') as EmailProviderType | undefined) ?? 'smtp';

    logger.log(`Initializing email provider: ${providerType}`);

    switch (providerType) {
      case 'ses':
        return new SesEmailProvider(configService);
      case 'smtp':
      default:
        return new SmtpEmailProvider(configService);
    }
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [emailProviderFactory, EmailService],
  exports: [EmailService, EmailProvider],
})
export class EmailModule {}
