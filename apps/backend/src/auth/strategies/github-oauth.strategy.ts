import { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';

export interface GithubOAuthUser {
  provider: 'github';
  providerId: string;
  email: string;
  displayName: string;
  accessToken: string;
}

@Injectable()
export class GithubOAuthStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(configService: ConfigService<EnvConfig>) {
    const logger = new Logger(GithubOAuthStrategy.name);
    const clientID = configService.get<string>('GITHUB_CLIENT_ID') ?? '';
    const clientSecret = configService.get<string>('GITHUB_CLIENT_SECRET') ?? '';
    const callbackURL =
      configService.get<string>('GITHUB_CALLBACK_URL') ??
      'http://localhost:3000/v1/auth/github/callback';

    if (!clientID || !clientSecret) {
      logger.warn(
        'GitHub OAuth credentials are not configured. GitHub login routes will fail until credentials are set.'
      );
    }

    super({
      clientID: clientID || 'disabled-github-client-id',
      clientSecret: clientSecret || 'disabled-github-client-secret',
      callbackURL,
      scope: ['user:email'],
    });
  }

  validate(
    accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: GithubOAuthUser) => void
  ): void {
    const emails = profile.emails as Array<{ value: string }> | undefined;
    const email = emails?.[0]?.value ?? '';

    const user: GithubOAuthUser = {
      provider: 'github',
      providerId: profile.id,
      email,
      displayName: profile.displayName,
      accessToken,
    };

    done(null, user);
  }
}
