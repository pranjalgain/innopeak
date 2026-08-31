import { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleOAuthUser {
  provider: 'google';
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService<EnvConfig>) {
    const logger = new Logger(GoogleOAuthStrategy.name);
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
    const callbackURL =
      configService.get<string>('GOOGLE_CALLBACK_URL') ??
      'http://localhost:3000/v1/auth/google/callback';

    if (!clientID || !clientSecret) {
      logger.warn(
        'Google OAuth credentials are not configured. Google login routes will fail until credentials are set.'
      );
    }

    super({
      clientID: clientID || 'disabled-google-client-id',
      clientSecret: clientSecret || 'disabled-google-client-secret',
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback
  ): void {
    const email = profile.emails?.[0]?.value ?? '';
    const firstName = profile.name?.givenName ?? '';
    const lastName = profile.name?.familyName ?? '';

    const user: GoogleOAuthUser = {
      provider: 'google',
      providerId: profile.id,
      email,
      firstName,
      lastName,
      accessToken,
      refreshToken,
    };

    done(null, user);
  }
}
