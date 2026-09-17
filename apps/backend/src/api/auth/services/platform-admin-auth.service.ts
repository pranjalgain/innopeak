import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import { EnvConfig } from '@config/env.config';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
import { GoogleIdentityProvider } from '../providers/google-identity.provider';
import type { GoogleAuthorizeRedirect } from '../types/google-authorize-redirect.type';
import type { GoogleIdentity } from '../types/google-identity.type';
import { buildAdminInviteLink } from '../utils/admin-invite-link.util';
import { normalizeEmail } from '../utils/email.utils';
import { hashToken } from '../utils/token.utils';

/**
 * Structurally distinct from `TokenIssuanceResult` (`AuthService`'s own tenant equivalent — no
 * `refreshToken` field, since a platform admin has none — see `TokenService.signPlatformAdminAccessToken`)
 * and `LoginPendingVerificationDto` (no `body`/`admin` field). `AuthController`'s Google callback
 * still needs to tell all of these apart with a plain `in`/`kind` check, which is why this shape
 * hasn't changed even though it now lives on its own service.
 */
export interface PlatformAdminLoginResult {
  admin: true;
  body: PlatformAdminTokenResponseDto;
}

/**
 * The outcome of resolving a Google identity against `platform_admin_identities` — used only by
 * the shared Google callback's login/signup branches (`AuthService.handleGoogleCallback`), to
 * decide whether this round trip belongs to a *returning* admin before it ever consults the
 * tenant tables. Not used by the `ADMIN_INVITE` intent, which is always a first-time link and
 * goes through `completeAdminInviteGoogle` instead.
 */
export type LinkedAdminLookup =
  | { linked: false }
  | { linked: true; active: false }
  | { linked: true; active: true; tokens: PlatformAdminLoginResult };

/**
 * Platform-admin authentication — login, and both invite-acceptance paths (password and Google).
 * Split out from the tenant `AuthService` so `POST /v1/admin/auth/login` has nothing left to
 * disambiguate: it queries `platform_admins` directly and nothing else, rather than sharing a
 * lookup-and-branch with tenant login the way the pre-split `AuthService.login` did. See
 * `apps/documentation/docs/backend/auth/separate-admin-login-design.md` for why.
 *
 * `AuthService` still owns the shared Google *callback* (`GET /v1/auth/google/callback`, one
 * route registered once with Google, dispatching on signed `state` — splitting that apart was
 * tried once already in this codebase's design history and abandoned), and calls into this
 * service for its two admin-touching branches: `completeAdminInviteGoogle` and `findLinkedAdmin`.
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

  /** Same purpose as `AuthService`'s own copy: a real hash of a value nobody knows, so a miss
   *  costs the same bcrypt work as a hit and the timing never reveals which happened. Its own
   *  instance rather than sharing `AuthService`'s — the two services no longer share any state,
   *  and this one is cheap enough (computed once, cached) that duplicating it beats introducing a
   *  dependency between them just for a decoy value. */
  private decoyHash?: Promise<string>;

  private decoyPasswordHash(): Promise<string> {
    this.decoyHash ??= this.hashingService.hash(randomBytes(32).toString('hex'));
    return this.decoyHash;
  }

  /**
   * `POST /v1/admin/auth/login`. Queries `platform_admins` directly — there is no tenant table
   * left to fall through to, unlike the pre-split shared `login`, since this route only ever
   * means "I am a platform admin." Same timing discipline as tenant login: the bcrypt compare
   * always runs, so a wrong password, an unknown email, and an `invited` admin with no password
   * yet all resolve in the same time and with the same generic message.
   */
  async login(dto: LoginDto): Promise<PlatformAdminLoginResult> {
    const email = normalizeEmail(dto.email);

    if (await this.loginAttemptService.isLockedOut(email, LoginAttemptScope.ADMIN)) {
      await this.hashingService.compare(dto.password, await this.decoyPasswordHash());
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    const admin = await this.platformAdminDbService.findForLogin(email);
    const passwordMatches = await this.hashingService.compare(
      dto.password,
      admin?.passwordHash ?? (await this.decoyPasswordHash())
    );

    if (!admin?.passwordHash || !passwordMatches) {
      await this.loginAttemptService.recordFailure(email, LoginAttemptScope.ADMIN);
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    await this.loginAttemptService.reset(email, LoginAttemptScope.ADMIN);

    // `invited` (no password yet) already failed the check above; only `disabled` reaches here.
    if (admin.status === PlatformAdminStatus.DISABLED) {
      throw new ForbiddenException(MESSAGES.AUTH.ACCOUNT_DISABLED);
    }

    return this.buildPlatformAdminLoginResult(admin);
  }

  /**
   * `GET /v1/admin/auth/invite/:token` — read-only preview so the accept screen can show "You've
   * been invited as `<email>`" before ever asking for a password. Same generic 404 for a token
   * that never existed, was already used, or has expired.
   */
  async validateAdminInvite(rawToken: string): Promise<AdminInvitePreviewDto> {
    const invite = await this.platformAdminDbService.findInviteEmailByTokenHash(
      hashToken(rawToken)
    );
    if (!invite) {
      throw new NotFoundException(MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE);
    }
    return AdminInvitePreviewDto.from(invite);
  }

  /**
   * `POST /v1/admin/auth/invite/accept` — the password path. Mirrors `login`'s token issuance
   * exactly, since accepting an invite signs the admin in immediately, same as a normal login.
   * See `completeAdminInviteGoogle` for the Google alternative.
   */
  async acceptAdminInvite(dto: AcceptAdminInviteDto): Promise<PlatformAdminLoginResult> {
    const passwordHash = await this.hashingService.hash(dto.password);
    const result = await this.platformAdminDbService.acceptInviteWithPassword({
      tokenHash: hashToken(dto.token),
      passwordHash,
    });

    if (result.outcome !== 'accepted') {
      throw new BadRequestException(MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE);
    }

    return this.buildPlatformAdminLoginResult(result);
  }

  /**
   * `GET /v1/admin/auth/invite/:token/google` — the same read-only shape
   * `AuthService.buildGoogleAuthorizeRedirect` uses (never throws for an expected failure, since
   * the browser is mid-navigation): validates the token before ever redirecting to Google, so a
   * dead link fails fast on the accept screen rather than after a round trip that can only fail
   * there anyway.
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
   * `GET /v1/admin/auth/google` — the Google button on the admin sign-in screen. Same read-only
   * shape as `buildAdminInviteGoogleRedirect` (never throws; the browser is mid-navigation).
   *
   * Exists because an admin who accepted their invite through Google has no `password_hash` at
   * all, so the password form on that screen can never sign them in — Google is their only way
   * back, and `AdminSettingsService.updatePlatformSettings` already refuses to disable
   * `socialLoginEnabled` while any such admin exists, on the stated grounds that the button is
   * "the only thing standing between them and no way in." Before this route that button lived
   * solely on the *tenant* login screen.
   *
   * `OAuthIntent.ADMIN_LOGIN`, not `LOGIN`: see the enum's own comment for why reusing the tenant
   * intent here would have been wrong in both directions.
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
   * Resolves a Google identity against `platform_admin_identities` for the shared callback's
   * ordinary login/signup branches — called from `AuthService.handleGoogleCallback` before it
   * ever consults the tenant tables, the same way password `login` used to check `platform_admins`
   * first. `{ linked: false }` means "not a returning admin," which is the common case and lets
   * the caller fall through to tenant resolution.
   *
   * Checked for both the `login` and `signup` tenant intents, not just `login`: the signup button
   * reaching here with an admin-linked Google account is someone clicking the wrong button, and
   * the right answer is their admin session — not a tenant account.
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
   * Completes an `OAuthIntent.ADMIN_INVITE` round trip: re-validates the invite, confirms the
   * IdP-verified email matches the invited address, links the Google identity, and signs the
   * admin in. Never throws — called from the shared callback, which is mid-navigation the same
   * way every other branch there is.
   *
   * `inviteToken` is only `undefined` if the state record somehow lost it, which never happens in
   * practice (`buildAdminInviteGoogleRedirect` always mints it alongside `intent`) — handled
   * defensively rather than asserted, since there is no token to build a targeted redirect from
   * either way.
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
        // No token to build an invite-page URL from, so this is the one admin failure that can't
        // land back on the accept screen. The admin sign-in page, not the tenant `/login` the
        // pre-split version used — that page has no admin path on it any more.
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

    // The check that stops someone other than the invited person from redeeming this link with
    // their own unrelated Google account — the invite token alone proves nothing about *whose*
    // Google account is completing it. Token is left unconsumed on a mismatch.
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

  /** `${FRONTEND_URL}/invite/:token?error=<code>` — shared by every failure branch above that
   *  has an invite token to target. Public: `AuthService.googleFailureRedirect` also calls this
   *  for the `ADMIN_INVITE` intent, since that dispatch stays on the shared callback. */
  adminInviteFailureUrl(inviteToken: string, failure: GoogleAuthFailure): string {
    const link = buildAdminInviteLink(this.configService.get<string>('FRONTEND_URL'), inviteToken);
    return `${link}?error=${failure}`;
  }

  /** Shared by `login`, `acceptAdminInvite`, `findLinkedAdmin`, and `completeAdminInviteGoogle` —
   *  every path that ends in "sign this platform admin in" builds the same token + DTO shape. */
  private buildPlatformAdminLoginResult(admin: {
    id: string;
    email: string;
  }): PlatformAdminLoginResult {
    const { accessToken, expiresIn } = this.tokenService.signPlatformAdminAccessToken(admin);

    const summary = new PlatformAdminSummaryDto();
    summary.id = admin.id;
    summary.email = admin.email;

    const body = new PlatformAdminTokenResponseDto();
    body.accessToken = accessToken;
    body.expiresIn = expiresIn;
    body.admin = summary;

    return { admin: true, body };
  }
}
