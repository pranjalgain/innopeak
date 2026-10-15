import { HashingService } from '@common/hashing/hashing.service';
import type { Locale } from '@common/i18n/locale';
import { EnvConfig } from '@config/env.config';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import { LoginAttemptScope, LoginAttemptService } from './login-attempt.service';
import { OAuthStateService } from './oauth-state.service';
import { TokenService } from './token.service';

import { SSO_REDIRECT, SsoAuthFailure, SsoProvider } from '../constants/sso-auth.constants';
import { AcceptAdminInviteDto } from '../dto/accept-admin-invite.dto';
import { AdminInvitePreviewDto } from '../dto/admin-invite-preview.dto';
import { LoginDto } from '../dto/login.dto';
import { PlatformAdminSummaryDto } from '../dto/platform-admin-summary.dto';
import { PlatformAdminTokenResponseDto } from '../dto/platform-admin-token-response.dto';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import { PlatformAdminStatus } from '../enums/platform-admin-status.enum';
import { UserIdentityProvider } from '../enums/user-identity-provider.enum';
import {
  AccountDisabledException,
  InvalidCredentialsException,
  InvalidOrExpiredInviteException,
  InviteNotFoundException,
} from '../exceptions/auth.exceptions';
import { GoogleIdentityProvider } from '../providers/google-identity.provider';
import { MicrosoftIdentityProvider } from '../providers/microsoft-identity.provider';
import type {
  LinkedAdminLookup,
  PlatformAdminLoginResult,
  SsoAuthorizeRedirect,
  SsoIdentity,
} from '../types/auth.type';
import { buildAdminInviteLink } from '../utils/admin-invite-link.util';
import {
  getAdminMicrosoftTenantId,
  isAdminMicrosoftLoginAvailable,
} from '../utils/admin-microsoft.util';
import { normalizeEmail } from '../utils/email.utils';
import { hashToken } from '../utils/token.utils';

/**
 * Split from the tenant `AuthService` so admin login queries only `platform_admins`. `AuthService`
 * still owns the shared Google callback (one route registered with Google, dispatching on signed
 * `state`) and calls in here for its admin branches.
 */
@Injectable()
export class PlatformAdminAuthService {
  private readonly logger = new Logger(PlatformAdminAuthService.name);

  constructor(
    private readonly platformAdminDbService: PlatformAdminDbService,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly oauthStateService: OAuthStateService,
    private readonly googleIdentityProvider: GoogleIdentityProvider,
    private readonly microsoftIdentityProvider: MicrosoftIdentityProvider,
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
  async buildAdminInviteGoogleRedirect(inviteToken: string): Promise<SsoAuthorizeRedirect> {
    const invite = await this.platformAdminDbService.findInviteEmailByTokenHash(
      hashToken(inviteToken)
    );
    if (!invite) {
      return {
        ok: false,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          SsoAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    if (!this.googleIdentityProvider.isConfigured()) {
      return {
        ok: false,
        redirectUrl: this.adminInviteFailureUrl(inviteToken, SsoAuthFailure.NOT_CONFIGURED),
      };
    }

    const { state, sid } = await this.oauthStateService.mint({
      provider: SsoProvider.GOOGLE,
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
  async buildAdminLoginGoogleRedirect(): Promise<SsoAuthorizeRedirect> {
    if (!this.googleIdentityProvider.isConfigured()) {
      return {
        ok: false,
        redirectUrl: `${SSO_REDIRECT.ADMIN_LOGIN}?error=${SsoAuthFailure.NOT_CONFIGURED}`,
      };
    }

    const { state, sid } = await this.oauthStateService.mint({
      provider: SsoProvider.GOOGLE,
      intent: OAuthIntent.ADMIN_LOGIN,
    });

    return {
      ok: true,
      authorizationUrl: this.googleIdentityProvider.buildAuthorizationUrl(state),
      sid,
    };
  }

  /**
   * The Microsoft button on the admin sign-in screen. Sign-in only (admins are invite-only), pinned to the organization's
   * directory so no other tenant or personal account ever reaches a consent screen. Never throws; the browser is mid-navigation.
   */
  async buildAdminLoginMicrosoftRedirect(): Promise<SsoAuthorizeRedirect> {
    const tenantId = getAdminMicrosoftTenantId(this.configService);
    if (tenantId === undefined || !this.isAdminMicrosoftConfigured()) {
      return {
        ok: false,
        redirectUrl: `${SSO_REDIRECT.ADMIN_LOGIN}?error=${SsoAuthFailure.NOT_CONFIGURED}&provider=${SsoProvider.MICROSOFT}`,
      };
    }

    const minted = await this.oauthStateService.mint({
      provider: SsoProvider.MICROSOFT,
      intent: OAuthIntent.ADMIN_LOGIN,
      pkce: true,
    });

    return {
      ok: true,
      authorizationUrl: this.microsoftIdentityProvider.buildAuthorizationUrl({
        state: minted.state,
        nonce: minted.nonce,
        codeChallenge: minted.codeChallenge ?? '',
        tenantId,
      }),
      sid: minted.sid,
    };
  }

  /**
   * Re-checked at the callback: the setting may have been removed while the admin was at Microsoft. One definition, shared with the
   * public platform-config's `adminMicrosoftLoginAvailable` (the Microsoft client and the pinned directory), so what the admin page
   * offers and what the route accepts cannot drift apart.
   */
  isAdminMicrosoftConfigured(): boolean {
    return isAdminMicrosoftLoginAvailable(this.configService);
  }

  /** The directory the callback must see in the ID token (`tid`) and send the token exchange to. */
  adminMicrosoftTenantId(): string | undefined {
    return getAdminMicrosoftTenantId(this.configService);
  }

  /**
   * Resolves a validated Microsoft identity to an existing platform admin; never creates one. Against
   * `platform_admin_identities` and `platform_admins` only, so it can't hand back a tenant session.
   * Order matters: the directory first (an address in any other Entra tenant, or a personal account,
   * proves nothing about an admin), then the immutable `sub`, and only then the verified email, to link
   * an admin's first Microsoft sign-in.
   */
  async signInWithMicrosoft(
    identity: SsoIdentity
  ): Promise<
    { ok: false; failure: SsoAuthFailure } | { ok: true; tokens: PlatformAdminLoginResult }
  > {
    const pinned = getAdminMicrosoftTenantId(this.configService);
    if (pinned === undefined || identity.tenantId !== pinned) {
      this.logger.warn(
        `Admin Microsoft sign-in refused: directory ${identity.tenantId ?? 'unknown'} is not the configured one`
      );
      return { ok: false, failure: SsoAuthFailure.NO_ACCOUNT };
    }

    const linked = await this.platformAdminDbService.findByIdentity(
      UserIdentityProvider.ENTRA_ID,
      identity.providerUserId
    );
    if (linked) {
      return linked.status === PlatformAdminStatus.ACTIVE
        ? { ok: true, tokens: this.buildPlatformAdminLoginResult(linked) }
        : { ok: false, failure: SsoAuthFailure.ACCOUNT_UNAVAILABLE };
    }

    // An address decides who someone is only here, on the first link, so it must be verified here.
    if (!identity.emailVerified) {
      return { ok: false, failure: SsoAuthFailure.EMAIL_NOT_VERIFIED };
    }

    const result = await this.platformAdminDbService.linkIdentityByEmail({
      provider: UserIdentityProvider.ENTRA_ID,
      providerUserId: identity.providerUserId,
      email: normalizeEmail(identity.email),
    });
    if (result.outcome === 'linked') {
      return { ok: true, tokens: this.buildPlatformAdminLoginResult(result) };
    }
    return {
      ok: false,
      failure:
        result.outcome === 'unavailable'
          ? SsoAuthFailure.ACCOUNT_UNAVAILABLE
          : SsoAuthFailure.NO_ACCOUNT,
    };
  }

  /**
   * The admin sign-in page's Google lookup: `{ linked: false }` means this Google account is not a
   * linked admin (the caller answers `NO_ACCOUNT`; it never falls through to tenant tables).
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
    identity: SsoIdentity
  ): Promise<
    | { ok: false; failure: SsoAuthFailure; redirectUrl: string }
    | { ok: true; tokens: PlatformAdminLoginResult }
  > {
    if (inviteToken === undefined) {
      return {
        ok: false,
        failure: SsoAuthFailure.INVALID_OR_EXPIRED_INVITE,
        // No token to build an invite-page URL from, so this failure lands on the admin sign-in
        // page; the tenant `/login` has no admin path.
        redirectUrl: `${SSO_REDIRECT.ADMIN_LOGIN}?error=${SsoAuthFailure.INVALID_OR_EXPIRED_INVITE}`,
      };
    }

    const invite = await this.platformAdminDbService.findInviteEmailByTokenHash(
      hashToken(inviteToken)
    );
    if (!invite) {
      return {
        ok: false,
        failure: SsoAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          SsoAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    // Stops someone else from redeeming this link with their own Google account: the token alone
    // proves nothing about whose account completes it. Token is left unconsumed on a mismatch.
    if (normalizeEmail(identity.email) !== normalizeEmail(invite.email)) {
      return {
        ok: false,
        failure: SsoAuthFailure.INVITE_EMAIL_MISMATCH,
        redirectUrl: this.adminInviteFailureUrl(inviteToken, SsoAuthFailure.INVITE_EMAIL_MISMATCH),
      };
    }

    const result = await this.platformAdminDbService.acceptInviteWithGoogleIdentity({
      tokenHash: hashToken(inviteToken),
      providerUserId: identity.providerUserId,
    });

    if (result.outcome === 'identity_already_linked') {
      return {
        ok: false,
        failure: SsoAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          SsoAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED
        ),
      };
    }
    if (result.outcome !== 'accepted') {
      return {
        ok: false,
        failure: SsoAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: this.adminInviteFailureUrl(
          inviteToken,
          SsoAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    return { ok: true, tokens: this.buildPlatformAdminLoginResult(result) };
  }

  /**
   * `${FRONTEND_URL}/invite/:token?error=<code>`. Public: `AuthService.googleFailureRedirect` calls
   * it for `ADMIN_INVITE` too.
   */
  adminInviteFailureUrl(inviteToken: string, failure: SsoAuthFailure): string {
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
