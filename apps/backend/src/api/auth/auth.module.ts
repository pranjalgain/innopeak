import { QueueUIModule } from '@bg/queue-ui.module';
import { BcryptService } from '@common/hashing/bcrypt.service';
import { HashingService } from '@common/hashing/hashing.service';
import { isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '@redis/redis.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_TTL_SECONDS } from './constants/auth.constants';
import { OtpAttemptService } from './otp-attempt.service';
import { FixedVerifyEmailTokenProvider } from './providers/fixed-verify-email-token.provider';
import { GoogleIdentityProvider } from './providers/google-identity.provider';
import { GoogleOidcProvider } from './providers/google-oidc.provider';
import { MockGoogleIdentityProvider } from './providers/mock-google-identity.provider';
import { RandomVerifyEmailTokenProvider } from './providers/random-verify-email-token.provider';
import { VerifyEmailTokenProvider } from './providers/verify-email-token.provider';
import { GoogleOAuthStateService } from './services/google-oauth-state.service';
import { PendingGoogleSignupService } from './services/pending-google-signup.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

// Non-production swaps in the fixed dev bypass code when DEV_VERIFY_EMAIL_TOKEN is set — same
// DI-swap pattern EmailModule uses for NoopEmailProvider, so AuthService itself never branches on
// environment. Forbidden in production by env-config.module.ts's Joi schema regardless.
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

// Same DI-swap as above: DEV_GOOGLE_AUTH_MOCK routes the whole sign-in through the real callback
// against a fabricated profile, so the flow is exercisable before an OAuth client exists. Joi
// forbids the flag in production.
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

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService<EnvConfig>) => ({
        secret: configService.get<string>('JWT_SECRET') ?? '',
        // Refresh tokens override `secret`/`expiresIn` per-call (TokenService) rather than a
        // second JwtModule registration — @nestjs/jwt's JwtService.sign()/verify() already accept
        // both as call-level overrides, so a second registered instance would just be unused
        // duplication.
        signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS }, // see the auth API reference's Session / token model
      }),
      inject: [ConfigService],
    }),
    QueueUIModule, // for AddingJobsToQueueManager — signup/login enqueue the verification OTP
    RedisModule, // OtpAttemptService's, GoogleOAuthStateService's, and PendingGoogleSignupService's stores
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    OtpAttemptService,
    JwtStrategy,
    verifyEmailTokenProviderFactory,
    googleIdentityProviderFactory,
    GoogleOAuthStateService,
    PendingGoogleSignupService,
    { provide: HashingService, useClass: BcryptService },
  ],
})
export class AuthModule {}
