import { QueueUIModule } from '@bg/queue-ui.module';
import { BillingReconciliationModule } from '@billing/billing-reconciliation.module';
import { BcryptService } from '@common/hashing/bcrypt.service';
import { HashingService } from '@common/hashing/hashing.service';
import { isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { MediaModule } from '@media/media.module';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '@redis/redis.module';

import { AuthController } from './auth.controller';
import { ACCESS_TOKEN_TTL_SECONDS } from './constants/auth.constants';
import { PlatformAdminAuthController } from './platform-admin-auth.controller';
import { FixedVerifyEmailTokenProvider } from './providers/fixed-verify-email-token.provider';
import { GoogleIdentityProvider } from './providers/google-identity.provider';
import { GoogleOidcProvider } from './providers/google-oidc.provider';
import { MicrosoftIdentityProvider } from './providers/microsoft-identity.provider';
import { MicrosoftOidcProvider } from './providers/microsoft-oidc.provider';
import { MockGoogleIdentityProvider } from './providers/mock-google-identity.provider';
import { MockMicrosoftIdentityProvider } from './providers/mock-microsoft-identity.provider';
import { RandomVerifyEmailTokenProvider } from './providers/random-verify-email-token.provider';
import { VerifyEmailTokenProvider } from './providers/verify-email-token.provider';
import { AccountAnonymizationService } from './services/account-anonymization.service';
import { AccountDeletionService } from './services/account-deletion.service';
import { AuthService } from './services/auth.service';
import { ErasureNoticeService } from './services/erasure-notice.service';
import { LoginAttemptService } from './services/login-attempt.service';
import { OAuthStateService } from './services/oauth-state.service';
import { OtpAttemptService } from './services/otp-attempt.service';
import { PendingSsoSignupService } from './services/pending-sso-signup.service';
import { PlatformAdminAuthService } from './services/platform-admin-auth.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

// Non-production swaps in the fixed dev bypass code when DEV_VERIFY_EMAIL_TOKEN is set, so AuthService
// never branches on environment. Joi forbids it in production.
const verifyEmailTokenProviderFactory = {
  provide: VerifyEmailTokenProvider,
  useFactory: (configService: ConfigService<EnvConfig>): VerifyEmailTokenProvider => {
    const devToken = configService.get<string>('DEV_VERIFY_EMAIL_TOKEN');

    if (devToken && !isProduction()) {
      return new FixedVerifyEmailTokenProvider(devToken);
    }

    return new RandomVerifyEmailTokenProvider();
  },
  inject: [ConfigService],
};

// Same DI swap: DEV_GOOGLE_AUTH_MOCK runs the real callback against a fabricated profile before an
// OAuth client exists. Joi forbids it in production.
const googleIdentityProviderFactory = {
  provide: GoogleIdentityProvider,
  useFactory: (configService: ConfigService<EnvConfig>): GoogleIdentityProvider => {
    const useMock = configService.get<string>('DEV_GOOGLE_AUTH_MOCK') === 'true';

    if (useMock && !isProduction()) {
      return new MockGoogleIdentityProvider(configService);
    }

    return new GoogleOidcProvider(configService);
  },
  inject: [ConfigService],
};

// Same DI-swap as Google's: DEV_MICROSOFT_AUTH_MOCK routes the whole sign-in through the real
// callback against a fabricated identity. Joi forbids the flag in production.
const microsoftIdentityProviderFactory = {
  provide: MicrosoftIdentityProvider,
  useFactory: (configService: ConfigService<EnvConfig>): MicrosoftIdentityProvider => {
    const useMock = configService.get<string>('DEV_MICROSOFT_AUTH_MOCK') === 'true';

    if (useMock && !isProduction()) {
      return new MockMicrosoftIdentityProvider(configService);
    }

    return new MicrosoftOidcProvider(configService);
  },
  inject: [ConfigService],
};

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService<EnvConfig>) => ({
        secret: configService.get<string>('JWT_SECRET') ?? '',
        // Refresh tokens override `secret`/`expiresIn` per call (TokenService) instead of a second JwtModule.
        signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      }),
      inject: [ConfigService],
    }),
    QueueUIModule, // for AddingJobsToQueueManager — signup/login enqueue the verification OTP
    RedisModule, // OtpAttemptService's, OAuthStateService's, and PendingSsoSignupService's stores
    BillingReconciliationModule, // AccountDeletionService stops/resumes the subscription on a self-service erasure
    MediaModule, // AuthService.me/toTokenIssuanceResult read the caller's current avatarUrl
  ],
  controllers: [AuthController, PlatformAdminAuthController],
  providers: [
    AuthService,
    PlatformAdminAuthService,
    TokenService,
    OtpAttemptService,
    LoginAttemptService,
    JwtStrategy,
    verifyEmailTokenProviderFactory,
    googleIdentityProviderFactory,
    microsoftIdentityProviderFactory,
    OAuthStateService,
    PendingSsoSignupService,
    AccountAnonymizationService,
    AccountDeletionService,
    ErasureNoticeService,
    { provide: HashingService, useClass: BcryptService },
  ],
  // TokenService/JwtModule: AdminSettingsService reissues the access token with a fresh `locale` claim.
  // OtpAttemptService/VerifyEmailTokenProvider: the admin add-password flow reuses the tenant step-up OTP.
  // AccountAnonymizationService: CronModule's nightly erasure purge. ErasureNoticeService: that job's emails
  // and AdminBusinessesService's request/cancel notices.
  exports: [
    TokenService,
    JwtModule,
    OtpAttemptService,
    VerifyEmailTokenProvider,
    AccountAnonymizationService,
    ErasureNoticeService,
  ],
})
export class AuthModule {}
