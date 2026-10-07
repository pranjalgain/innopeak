import { HashingService } from '@common/hashing/hashing.service';
import type { Locale } from '@common/i18n/locale';
import { EnvConfig } from '@config/env.config';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import { GoogleOAuthStateService } from './google-oauth-state.service';
import { LoginAttemptScope, LoginAttemptService } from './login-attempt.service';
import { TokenService } from './token.service';

import { GOOGLE_AUTH_REDIRECT, GoogleAuthFailure } from '../constants/google-auth.constants';
import { AcceptAdminInviteDto } from '../dto/accept-admin-invite.dto';
import { AdminInvitePreviewDto } from '../dto/admin-invite-preview.dto';
import { LoginDto } from '../dto/login.dto';
import { PlatformAdminSummaryDto } from '../dto/platform-admin-summary.dto';
import { PlatformAdminTokenResponseDto } from '../dto/platform-admin-token-response.dto';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import { PlatformAdminStatus } from '../enums/platform-admin-status.enum';
import {
  AccountDisabledException,
  InvalidCredentialsException,
  InvalidOrExpiredInviteException,
  InviteNotFoundException,
} from '../exceptions/auth.exceptions';
import { GoogleIdentityProvider } from '../providers/google-identity.provider';
import type {
  GoogleAuthorizeRedirect,
  GoogleIdentity,
  LinkedAdminLookup,
  PlatformAdminLoginResult,
} from '../types/auth.type';
import { buildAdminInviteLink } from '../utils/admin-invite-link.util';
import { normalizeEmail } from '../utils/email.utils';
import { hashToken } from '../utils/token.utils';

/**
 * Split from the tenant `AuthService` so admin login queries only `platform_admins`. `AuthService`
 * still owns the shared Google callback (one route registered with Google, dispatching on signed
 * `state`) and calls in here for its admin branches.
 */
@Injectable()
export class PlatformAdminAuthService {
  constructor(
    private readonly platformAdminDbService: PlatformAdminDbService,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly googleOAuthStateService: GoogleOAuthStateService,
    private readonly googleIdentityProvider: GoogleIdentityProvider,
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  /**
   * Decoy hash so a miss costs the same bcrypt work as a hit. Not shared with `AuthService`, to
   * avoid a dependency between the services for a cached value.
   */
  private decoyHash?: Promise<string>;

  private decoyPasswordHash(): Promise<string> {
    this.decoyHash ??= this.hashingService.hash(randomBytes(32).toString('hex'));
    return this.decoyHash;
  }

  /**
   * Same timing discipline as tenant login: the bcrypt compare always runs, so a wrong password, an
   * unknown email and an `invited` admin with no password yet take the same time and give the same
   * generic message.
   */
  async login(dto: LoginDto): Promise<PlatformAdminLoginResult> {
    const email = normalizeEmail(dto.email);

    if (await this.loginAttemptService.isLockedOut(email, LoginAttemptScope.ADMIN)) {
      await this.hashingService.compare(dto.password, await this.decoyPasswordHash());
      throw new InvalidCredentialsException();
    }

    const admin = await this.platformAdminDbService.findForLogin(email);
    const passwordMatches = await this.hashingService.compare(
      dto.password,
      admin?.passwordHash ?? (await this.decoyPasswordHash())
    );

    if (!admin?.passwordHash || !passwordMatches) {
      await this.loginAttemptService.recordFailure(email, LoginAttemptScope.ADMIN);
      throw new InvalidCredentialsException();
    }

    await this.loginAttemptService.reset(email, LoginAttemptScope.ADMIN);

    // `invited` (no password yet) already failed the check above; only `disabled` reaches here.
    if (admin.status === PlatformAdminStatus.DISABLED) {
      throw new AccountDisabledException();
    }

    return this.buildPlatformAdminLoginResult(admin);
  }

  /** Same generic 404 for a token that never existed, was used, or expired. */
  async validateAdminInvite(rawToken: string): Promise<AdminInvitePreviewDto> {
    const invite = await this.platformAdminDbService.findInviteEmailByTokenHash(
      hashToken(rawToken)
    );
    if (!invite) {
      throw new InviteNotFoundException();
    }
    return AdminInvitePreviewDto.from(invite);
  }

  /** Signs the admin in immediately, mirroring `login`'s token issuance. */
  async acceptAdminInvite(dto: AcceptAdminInviteDto): Promise<PlatformAdminLoginResult> {
    const passwordHash = await this.hashingService.hash(dto.password);
    const result = await this.platformAdminDbService.acceptInviteWithPassword({
      tokenHash: hashToken(dto.token),
      passwordHash,
    });

    if (result.outcome !== 'accepted') {
      throw new InvalidOrExpiredInviteException();
    }

    return this.buildPlatformAdminLoginResult(result);
  }

  /**
   * Never throws for an expected failure (the browser is mid-navigation); validates the token
   * before redirecting so a dead link fails fast.
   */
  async buildAdminInviteGoogleRedirect(inviteToken: string): Promise<GoogleAuthorizeRedirect> {
    const invite = await this.platformAdminDbService.findInviteEmailByTokenHash(
      hashToken(inviteToken)
    );
    if (!invite) {
      return {
        ok: false,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    if (!this.googleIdentityProvider.isConfigured()) {
      return {
        ok: false,
        redirectUrl: this.adminInviteFailureUrl(inviteToken, GoogleAuthFailure.NOT_CONFIGURED),
      };
    }

    const { state, sid } = await this.googleOAuthStateService.mint({
      intent: OAuthIntent.ADMIN_INVITE,
      inviteToken,
    });

    return {
      ok: true,
      authorizationUrl: this.googleIdentityProvider.buildAuthorizationUrl(state),
      sid,
    };
  }

  /**
   * An admin who accepted their invite through Google has no `password_hash`, so Google is their
   * only way back in. Uses `OAuthIntent.ADMIN_LOGIN`, not `LOGIN` (see the enum). Never throws; the
   * browser is mid-navigation.
   */
  async buildAdminLoginGoogleRedirect(): Promise<GoogleAuthorizeRedirect> {
    if (!this.googleIdentityProvider.isConfigured()) {
      return {
        ok: false,
        redirectUrl: `${GOOGLE_AUTH_REDIRECT.ADMIN_LOGIN}?error=${GoogleAuthFailure.NOT_CONFIGURED}`,
      };
    }

    const { state, sid } = await this.googleOAuthStateService.mint({
      intent: OAuthIntent.ADMIN_LOGIN,
    });

    return {
      ok: true,
      authorizationUrl: this.googleIdentityProvider.buildAuthorizationUrl(state),
      sid,
    };
  }

  /**
   * `{ linked: false }` means not a returning admin and lets the caller fall through to tenant
   * resolution. Checked for `signup` too: an admin-linked Google account on the signup button is
   * someone clicking the wrong button, and the right answer is their admin session.
   */
  async findLinkedAdmin(providerUserId: string): Promise<LinkedAdminLookup> {
    const linkedAdmin = await this.platformAdminDbService.findByGoogleIdentity(providerUserId);
    if (!linkedAdmin) {
      return { linked: false };
    }
    if (linkedAdmin.status !== PlatformAdminStatus.ACTIVE) {
      return { linked: true, active: false };
    }
    return { linked: true, active: true, tokens: this.buildPlatformAdminLoginResult(linkedAdmin) };
  }

  /**
   * Never throws: called from the shared callback, with the browser mid-navigation. `inviteToken`
   * is only undefined if the state record lost it; handled defensively since there is no token to
   * build a targeted redirect from.
   */
  async completeAdminInviteGoogle(
    inviteToken: string | undefined,
    identity: GoogleIdentity
  ): Promise<
    | { ok: false; failure: GoogleAuthFailure; redirectUrl: string }
    | { ok: true; tokens: PlatformAdminLoginResult }
  > {
    if (inviteToken === undefined) {
      return {
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
        // No token to build an invite-page URL from, so this failure lands on the admin sign-in
        // page; the tenant `/login` has no admin path.
        redirectUrl: `${GOOGLE_AUTH_REDIRECT.ADMIN_LOGIN}?error=${GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE}`,
      };
    }

    const invite = await this.platformAdminDbService.findInviteEmailByTokenHash(
      hashToken(inviteToken)
    );
    if (!invite) {
      return {
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    // Stops someone else from redeeming this link with their own Google account: the token alone
    // proves nothing about whose account completes it. Token is left unconsumed on a mismatch.
    if (normalizeEmail(identity.email) !== normalizeEmail(invite.email)) {
      return {
        ok: false,
        failure: GoogleAuthFailure.INVITE_EMAIL_MISMATCH,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.INVITE_EMAIL_MISMATCH
        ),
      };
    }

    const result = await this.platformAdminDbService.acceptInviteWithGoogleIdentity({
      tokenHash: hashToken(inviteToken),
      providerUserId: identity.providerUserId,
    });

    if (result.outcome === 'identity_already_linked') {
      return {
        ok: false,
        failure: GoogleAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED
        ),
      };
    }
    if (result.outcome !== 'accepted') {
      return {
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    return { ok: true, tokens: this.buildPlatformAdminLoginResult(result) };
  }

  /**
   * `${FRONTEND_URL}/invite/:token?error=<code>`. Public: `AuthService.googleFailureRedirect` calls
   * it for `ADMIN_INVITE` too.
   */
  adminInviteFailureUrl(inviteToken: string, failure: GoogleAuthFailure): string {
    const link = buildAdminInviteLink(this.configService.get<string>('FRONTEND_URL'), inviteToken);
    return `${link}?error=${failure}`;
  }

  private buildPlatformAdminLoginResult(admin: {
    id: string;
    email: string;
    locale: Locale | null;
  }): PlatformAdminLoginResult {
    const { accessToken, expiresIn } = this.tokenService.signPlatformAdminAccessToken(admin);

    const summary = new PlatformAdminSummaryDto();
    summary.id = admin.id;
    summary.email = admin.email;
    summary.locale = admin.locale;

    const body = new PlatformAdminTokenResponseDto();
    body.accessToken = accessToken;
    body.expiresIn = expiresIn;
    body.admin = summary;

    return { admin: true, body };
  }
}
