import { JobName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import type { Locale } from '@common/i18n/locale';
import { isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { AuthDbService, type TenantRow } from '@db/repositories/auth/auth.db-service';
import { DemoDataDbService } from '@db/repositories/demo-data/demo-data.db-service';
import { MediaService } from '@media/media.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import { GoogleOAuthStateService } from './google-oauth-state.service';
import { LoginAttemptScope, LoginAttemptService } from './login-attempt.service';
import { OtpAttemptService } from './otp-attempt.service';
import { PendingGoogleSignupService } from './pending-google-signup.service';
import {
  PlatformAdminAuthService,
  type PlatformAdminLoginResult,
} from './platform-admin-auth.service';
import { TokenService } from './token.service';

import { GOOGLE_AUTH_REDIRECT, GoogleAuthFailure } from '../constants/google-auth.constants';
import { AcceptMemberInviteDto } from '../dto/accept-member-invite.dto';
import { AuthenticatedUserDto } from '../dto/authenticated-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginPendingVerificationDto } from '../dto/login-response.dto';
import { LoginDto } from '../dto/login.dto';
import { MemberInvitePreviewDto } from '../dto/member-invite-preview.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import { SetPasswordDto } from '../dto/set-password.dto';
import { SignupResponseDto } from '../dto/signup-response.dto';
import { SignupDto } from '../dto/signup.dto';
import { TokenResponseDto } from '../dto/token-response.dto';
import { UpdateLocaleResponseDto } from '../dto/update-locale-response.dto';
import { UpdateLocaleDto } from '../dto/update-locale.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import {
  AccountDisabledException,
  EmailAlreadyRegisteredException,
  GooglePendingSignupExpiredException,
  InvalidAccessTokenException,
  InvalidCredentialsException,
  InvalidCurrentPasswordException,
  InvalidOrExpiredInviteException,
  InvalidOtpException,
  InviteNotFoundException,
  NoPasswordSetException,
  PasswordAlreadySetException,
  TenantSuspendedException,
} from '../exceptions/auth.exceptions';
import { GoogleIdentityProvider } from '../providers/google-identity.provider';
import { VerifyEmailTokenProvider } from '../providers/verify-email-token.provider';
import type { AuthUser } from '../types/auth-user.type';
import type { GoogleAuthorizeRedirect } from '../types/google-authorize-redirect.type';
import type { GoogleIdentity } from '../types/google-identity.type';
import { normalizeEmail } from '../utils/email.utils';
import { buildMemberInviteLink } from '../utils/member-invite-link.util';
import { requireTenantUser } from '../utils/require-tenant-user.util';
import { hashToken } from '../utils/token.utils';

export type { GoogleAuthorizeRedirect };

export interface GoogleAuthorizeInput {
  intent: OAuthIntent;
}

/**
 * What a successful verify-email/login/refresh actually produces: the JSON body (no refresh
 * token in it) plus the raw refresh token separately, so `AuthController` can set it as an
 * httpOnly cookie instead of serializing it into the response — a script on the page should
 * never be able to read it.
 */
export type GoogleCallbackOutcome =
  /** `redirectUrl` is already the full `<page>?error=<failure>` target — computed here, from
   *  `intent`, rather than by `AuthController.googleCallback`. */
  | { ok: false; failure: GoogleAuthFailure; redirectUrl: string }
  /** `OAuthIntent.ADMIN_INVITE` completed, or a returning Google-linked admin signed back in on
   *  an ordinary login/signup round trip — see `PlatformAdminAuthService.completeAdminInviteGoogle`
   *  / `findLinkedAdmin`. */
  | { ok: true; kind: 'admin_signed_in'; tokens: PlatformAdminLoginResult }
  /** A genuinely new person — the caller sets `pendingSignupCookie` and redirects to collect a business name. */
  | { ok: true; kind: 'needs_business_name'; pendingSignupCookie: string }
  | { ok: true; kind: 'signed_in'; tokens: TokenIssuanceResult };

export interface TokenIssuanceResult {
  body: TokenResponseDto;
  refreshToken: string;
}

interface IssueOtpInput {
  userId: string;
  email: string;
  name: string;
}

interface SendOtpEmailInput {
  email: string;
  customerName: string;
  rawOtp: string;
}

interface SeedDemoDataIfDevInput {
  userId: string;
  tenantId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authDbService: AuthDbService,
    private readonly hashingService: HashingService,
    private readonly verifyEmailTokenProvider: VerifyEmailTokenProvider,
    private readonly tokenService: TokenService,
    private readonly otpAttemptService: OtpAttemptService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly queueManager: AddingJobsToQueueManager,
    private readonly configService: ConfigService<EnvConfig>,
    private readonly googleIdentityProvider: GoogleIdentityProvider,
    private readonly googleOAuthStateService: GoogleOAuthStateService,
    private readonly pendingGoogleSignupService: PendingGoogleSignupService,
    private readonly demoDataDbService: DemoDataDbService,
    private readonly platformAdminAuthService: PlatformAdminAuthService,
    private readonly mediaService: MediaService
  ) {}

  /**
   * A real hash of a value nobody knows, compared against when no account matched, purely so the
   * miss path costs the same bcrypt work as the hit path. Computed once and reused (hashing per
   * request would double the cost of every failed login); derived from the same HashingService as
   * real passwords so it automatically tracks the configured cost factor.
   */
  private decoyHash?: Promise<string>;

  private decoyPasswordHash(): Promise<string> {
    this.decoyHash ??= this.hashingService.hash(randomBytes(32).toString('hex'));
    return this.decoyHash;
  }

  /**
   * Deliberately does NOT check whether this email belongs to a platform admin. Before
   * `POST /v1/admin/auth/login` split off into its own route, tenant `login` had to resolve an
   * email to exactly one of `platform_admins`/`users`, and this guard existed to keep that
   * possible. Now that login is two separate routes with nothing left to disambiguate, the same
   * email may exist as both a platform admin and, separately, a tenant business owner — two
   * unrelated accounts that happen to share a mailbox, same as any other system where one address
   * can be an org admin in one place and an ordinary member somewhere else. See
   * `apps/documentation/docs/backend/auth/separate-admin-login-design.md`'s dual-identity
   * decision for the reasoning and what this removed.
   *
   * `AdminSettingsService.sendInvite` dropped its mirror of this guard at the same time, so the
   * relaxation holds in both directions: an admin's address can sign up as a tenant, and an
   * existing tenant's address can be invited as an admin.
   */
  async signup(dto: SignupDto): Promise<SignupResponseDto> {
    const email = normalizeEmail(dto.email);

    const passwordHash = await this.hashingService.hash(dto.password);
    const rawOtp = this.verifyEmailTokenProvider.generate();

    const result = await this.authDbService.signup({
      businessName: dto.businessName,
      ownerName: dto.ownerName,
      email,
      passwordHash,
      tokenHash: hashToken(rawOtp),
      tokenExpiresAt: this.otpExpiresAt(),
    });

    if (!result) {
      throw new EmailAlreadyRegisteredException();
    }

    this.sendOtpEmail({ email, customerName: result.ownerName, rawOtp });

    return SignupResponseDto.from(result, MESSAGES.AUTH.SIGNUP_OTP_SENT(email));
  }

  /**
   * Issuing tokens here (not just marking the account active) is safe specifically because an
   * OTP screen is only ever reached after the caller already proved they know the account's
   * password in *this* request flow — either they just set one at signup, or they just typed one
   * at login. Unlike the link-based flow this replaced, nothing can reach this route without
   * that proof (a code isn't clickable/prefetchable by an email scanner).
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<TokenIssuanceResult> {
    const email = normalizeEmail(dto.email);

    // Budget is spent *before* the code is compared, so an exhausted account can't be probed at
    // all — see OtpAttemptService for why the per-IP throttle alone doesn't cover this.
    if (!(await this.otpAttemptService.consumeAttempt(email))) {
      throw new HttpException(MESSAGES.AUTH.TOO_MANY_OTP_ATTEMPTS, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.authDbService.verifyEmail({ email, tokenHash: hashToken(dto.otp) });

    if (!user) {
      throw new InvalidOtpException();
    }

    await this.otpAttemptService.reset(email);

    // Only ever fires once per tenant — `AuthDbService.verifyEmail` only returns non-null when
    // `activateUser`'s conditional `WHERE status = 'pending_verification'` actually flipped a row,
    // which for a given user can happen exactly once. This is the password-signup analog of
    // `handleGoogleCallback`'s `firstActivation` check and `completeGoogleSignup`'s unconditional
    // call — three paths, one moment each, all meaning "a brand-new tenant just finished signing
    // up." See `seedDemoDataIfDev`.
    this.seedDemoDataIfDev({ userId: user.id, tenantId: user.tenantId });

    return this.buildTokenIssuanceResult(user);
  }

  /**
   * Order matters: credentials are checked *before* branching on status, so `pending_verification`
   * is only revealed to someone who already proved they know the password — not to anyone who
   * merely knows the email exists.
   *
   * Tenant-user login only — a platform admin has their own route,
   * `POST /v1/admin/auth/login` (`PlatformAdminAuthService.login`), which queries
   * `platform_admins` directly. See `separate-admin-login-design.md` for why the two are split
   * rather than one endpoint resolving which identity space an email belongs to.
   */
  async login(dto: LoginDto): Promise<LoginPendingVerificationDto | TokenIssuanceResult> {
    const email = normalizeEmail(dto.email);

    // Per-account ceiling, checked before any DB work. The per-IP throttle on this route does not
    // cover credential stuffing, which arrives from many addresses a few attempts each, all aimed
    // at one account. A locked address still pays for one decoy comparison and still gets the
    // identical INVALID_CREDENTIALS — skipping the bcrypt cost would make the faster response the
    // tell, and a distinct "locked" code would confirm both that the account exists and that the
    // threshold was found.
    if (await this.loginAttemptService.isLockedOut(email, LoginAttemptScope.TENANT)) {
      await this.hashingService.compare(dto.password, await this.decoyPasswordHash());
      throw new InvalidCredentialsException();
    }

    const user = await this.authDbService.findUserForLogin(email);

    // Always pay for one password comparison, even when there is no account (or the account is
    // SSO-only and has no hash). Short-circuiting here would return in ~1ms for an unknown email
    // versus ~100ms of bcrypt for a known one — a timing oracle that enumerates registered
    // addresses and defeats the whole point of the uniform INVALID_CREDENTIALS message below.
    const passwordMatches = await this.hashingService.compare(
      dto.password,
      user?.passwordHash ?? (await this.decoyPasswordHash())
    );

    if (!user?.passwordHash || !passwordMatches) {
      await this.loginAttemptService.recordFailure(email, LoginAttemptScope.TENANT);
      throw new InvalidCredentialsException();
    }

    // The password is proven from here on, so the failure budget has served its purpose. Cleared
    // before the status branches below: a `pending_verification` or suspended account that typed
    // the right password should not keep burning attempts it already passed.
    await this.loginAttemptService.reset(email, LoginAttemptScope.TENANT);

    if (user.status === UserStatus.DISABLED) {
      throw new AccountDisabledException();
    }

    const tenant = await this.authDbService.findTenantStatus(user.tenantId);
    if (tenant?.status === TenantStatus.SUSPENDED) {
      throw new TenantSuspendedException();
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      await this.issueOtp({ userId: user.id, email, name: user.name });

      const response = new LoginPendingVerificationDto();
      response.status = UserStatus.PENDING_VERIFICATION;
      response.email = email;
      response.message = MESSAGES.AUTH.LOGIN_OTP_SENT(email);
      return response;
    }

    return this.buildTokenIssuanceResult(user, tenant);
  }

  /**
   * Explicit "resend" click on the OTP stepper — unlike login/signup, this doesn't collect a
   * password (the stepper's resend button never did), so it can't re-prove the caller knows it.
   * Always returns the same generic acknowledgement regardless of whether the email matches a
   * pending_verification account, same enumeration-prevention shape as forgot-password.
   */
  async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    const email = normalizeEmail(dto.email);
    const user = await this.authDbService.findUserForLogin(email);

    if (user?.status === UserStatus.PENDING_VERIFICATION) {
      await this.issueOtp({ userId: user.id, email, name: user.name });
    }

    return { message: MESSAGES.AUTH.RESEND_OTP_ACK };
  }

  /** `rawRefreshToken` comes from the `refresh_token` cookie — see `AuthController.refresh`. */
  async refresh(rawRefreshToken: string): Promise<TokenIssuanceResult> {
    const { tokens, user, tenant } = await this.tokenService.rotate(rawRefreshToken);
    return this.toTokenIssuanceResult(tokens, user, tenant);
  }

  /**
   * Driven by the `refresh_token` cookie rather than the access token, because the case that most
   * needs revoking is exactly the one an access-token-guarded route can't serve: a session left
   * idle past the 15-minute access TTL. Guarding this route meant that logout 401'd and revoked
   * nothing, leaving a valid 7-day refresh token in a browser whose user believed they had signed
   * out. Idempotent — a missing or unverifiable cookie still succeeds, since the caller's cookies
   * are cleared regardless and there is nothing to reveal about which case occurred.
   */
  async logout(rawRefreshToken: string | undefined): Promise<{ message: string }> {
    if (rawRefreshToken) {
      await this.tokenService.revokeBySessionToken(rawRefreshToken);
    }
    return { message: MESSAGES.AUTH.LOGGED_OUT };
  }

  /**
   * Proof of the current password, then a new hash + wholesale session revoke in one DB
   * transaction, then a fresh pair so this tab stays signed in. Other devices die. See
   * POST /v1/auth/change-password in the auth API reference.
   */
  async changePassword(actor: AuthUser, dto: ChangePasswordDto): Promise<TokenIssuanceResult> {
    const tenantUser = requireTenantUser(actor, MESSAGES.AUTH.TENANT_ONLY);

    const user = await this.authDbService.findUserById(tenantUser.id);
    if (!user) {
      throw new InvalidAccessTokenException();
    }

    if (!user.passwordHash) {
      throw new NoPasswordSetException();
    }

    const currentMatches = await this.hashingService.compare(
      dto.currentPassword,
      user.passwordHash
    );
    if (!currentMatches) {
      throw new InvalidCurrentPasswordException();
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.authDbService.updatePasswordAndRevokeSessions({
      userId: user.id,
      passwordHash: newPasswordHash,
    });

    return this.buildTokenIssuanceResult({ ...user, passwordHash: newPasswordHash });
  }

  /**
   * The authoritative answer to "who is signed in", for screens that must not guess.
   *
   * Settings' Profile tab used to assemble this from localStorage the frontend had written at its
   * last sign-in, falling back to mock data when a key was missing — which showed a stranger's
   * name and company to anyone whose session predated those keys, and offered "Change password"
   * to Google-only accounts that have none. Reading it from the DB per request removes the guess.
   */
  async me(actor: AuthUser): Promise<AuthenticatedUserDto> {
    const tenantUser = requireTenantUser(actor, MESSAGES.AUTH.TENANT_ONLY);

    const user = await this.authDbService.findUserById(tenantUser.id);
    if (!user) {
      throw new InvalidAccessTokenException();
    }

    const [tenant, avatarUrl] = await Promise.all([
      this.authDbService.findTenantStatus(user.tenantId),
      this.mediaService.getUserAvatarUrl(user.id),
    ]);
    return this.toAuthenticatedUserDto(user, tenant, avatarUrl);
  }

  /**
   * The other half of `changePassword` — for an account that has never had one (Google/SSO-only,
   * `password_hash IS NULL`), so there is no current password to prove. `changePassword` proves
   * intent with the current password; this proves it with a fresh OTP from
   * `requestSetPasswordOtp` instead, since without *some* second factor an access token alone
   * (stolen or otherwise) would be enough to turn a 15-minute credential into a permanent one —
   * see `requestSetPasswordOtp`'s doc comment. Settings' "Add password" flow calls this once the
   * OTP step completes; from then on that account uses `changePassword`.
   */
  async setPassword(actor: AuthUser, dto: SetPasswordDto): Promise<TokenIssuanceResult> {
    const tenantUser = requireTenantUser(actor, MESSAGES.AUTH.TENANT_ONLY);

    const user = await this.authDbService.findUserById(tenantUser.id);
    if (!user) {
      throw new InvalidAccessTokenException();
    }

    if (user.passwordHash) {
      throw new PasswordAlreadySetException();
    }

    // Budget spent before comparison, same shape as `verifyEmail` — an exhausted account can't be
    // probed for the code at all.
    if (!(await this.otpAttemptService.consumeAttempt(user.email))) {
      throw new HttpException(MESSAGES.AUTH.TOO_MANY_OTP_ATTEMPTS, HttpStatus.TOO_MANY_REQUESTS);
    }

    const otpValid = await this.authDbService.consumeSetPasswordOtp({
      userId: user.id,
      tokenHash: hashToken(dto.otp),
    });
    if (!otpValid) {
      throw new InvalidOtpException();
    }
    await this.otpAttemptService.reset(user.email);

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.authDbService.updatePasswordAndRevokeSessions({
      userId: user.id,
      passwordHash: newPasswordHash,
    });

    return this.buildTokenIssuanceResult({ ...user, passwordHash: newPasswordHash });
  }

  /**
   * Step-up verification `setPassword` requires before it will act: proof the caller currently
   * controls the account's mailbox, not just its access token. Without this, `setPassword` was
   * reachable by anyone holding a stolen access token alone — no current password to prove (there
   * is none yet) and no re-auth step, so a 15-minute credential became an indefinite one on any
   * Google-only account. Mailed via the same OTP machinery as signup/login, under the
   * `token_purpose` enum's `reset` value (see `AuthRepository.putSetPasswordOtp`) — this account
   * already proved its email once at signup; this re-proves it's still the one reading that inbox
   * right now.
   */
  async requestSetPasswordOtp(actor: AuthUser): Promise<{ message: string }> {
    const tenantUser = requireTenantUser(actor, MESSAGES.AUTH.TENANT_ONLY);

    const user = await this.authDbService.findUserById(tenantUser.id);
    if (!user) {
      throw new InvalidAccessTokenException();
    }

    if (user.passwordHash) {
      throw new PasswordAlreadySetException();
    }

    if (await this.otpAttemptService.claimResend(user.email)) {
      const rawOtp = this.verifyEmailTokenProvider.generate();
      await this.authDbService.putSetPasswordOtp({
        userId: user.id,
        tokenHash: hashToken(rawOtp),
        expiresAt: this.otpExpiresAt().toISOString(),
      });
      this.sendOtpEmail({ email: user.email, customerName: user.name, rawOtp });
    }

    return { message: MESSAGES.AUTH.SET_PASSWORD_OTP_ACK };
  }

  /**
   * Settings → Profile's language preference — resolution order step 1
   * (`apps/documentation/docs/meta/multilingual.md`). Persists `users.locale`, then re-signs only
   * the access token (`TokenService.reissueAccessToken`) so the new value is on its `locale` claim
   * immediately, rather than leaving this tab's own requests reading the stale claim until it next
   * refreshes. Unlike `changePassword`, this does not revoke other sessions — a locale preference
   * is not a security boundary, so another signed-in tab is simply left to pick it up on its own
   * next refresh.
   *
   * Deliberately does NOT call `buildTokenIssuanceResult`/`issueTokenPair` here: those mint a new
   * refresh token and a `refresh_tokens` row, which is the right shape for a real sign-in event
   * but not for a claim refresh authenticated by nothing more than the caller's existing access
   * token. See `TokenService.reissueAccessToken`'s own doc comment for why that distinction is a
   * real security boundary, not a style choice.
   */
  async updateLocale(actor: AuthUser, dto: UpdateLocaleDto): Promise<UpdateLocaleResponseDto> {
    const tenantUser = requireTenantUser(actor, MESSAGES.AUTH.TENANT_ONLY);

    const user = await this.authDbService.findUserById(tenantUser.id);
    if (!user) {
      throw new InvalidAccessTokenException();
    }

    const tenant = await this.authDbService.findTenantStatus(user.tenantId);
    await this.assertGoodStanding(user.status, tenant);

    await this.authDbService.updateLocale({ userId: user.id, locale: dto.locale });

    const updatedUser = { ...user, locale: dto.locale };
    const { accessToken, expiresIn } = this.tokenService.reissueAccessToken(updatedUser);
    const avatarUrl = await this.mediaService.getUserAvatarUrl(user.id);

    const response = new UpdateLocaleResponseDto();
    response.accessToken = accessToken;
    response.expiresIn = expiresIn;
    response.user = this.toAuthenticatedUserDto(updatedUser, tenant, avatarUrl);
    return response;
  }

  /**
   * Issues (and mails) a fresh verification code, unless one went out inside the cooldown.
   *
   * The cooldown is not just spam control: `putVerifyEmailToken` *upserts*, so every issue
   * replaces the live code. Uncapped, anyone who knows a pending address could overwrite the
   * victim's code faster than they could type it and block verification outright. Returning
   * silently on a refused claim keeps the caller's response identical either way — `resendOtp`
   * already answers the same generic acknowledgement regardless of whether anything was sent.
   */
  private async issueOtp(input: IssueOtpInput): Promise<void> {
    const { userId, email, name } = input;
    if (!(await this.otpAttemptService.claimResend(email))) {
      return;
    }

    const rawOtp = this.verifyEmailTokenProvider.generate();
    await this.authDbService.putVerifyEmailToken({
      userId,
      tokenHash: hashToken(rawOtp),
      expiresAt: this.otpExpiresAt().toISOString(),
    });
    this.sendOtpEmail({ email, customerName: name, rawOtp });
  }

  /**
   * `GET /v1/auth/invite/:token` — read-only preview so the accept screen can show "You've been
   * invited as `<email>`" before ever asking for a name or password. Same generic 404 for a token
   * that never existed, was already used, or has expired as the platform-admin equivalent
   * (`PlatformAdminAuthService.validateAdminInvite`) — see `MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE`.
   */
  async validateMemberInvite(rawToken: string): Promise<MemberInvitePreviewDto> {
    const invite = await this.authDbService.findMemberInviteEmailByTokenHash(hashToken(rawToken));
    if (!invite) {
      throw new InviteNotFoundException();
    }
    return MemberInvitePreviewDto.from(invite);
  }

  /**
   * `POST /v1/auth/invite/accept` — the password path. Mirrors
   * `PlatformAdminAuthService.acceptAdminInvite`'s token issuance exactly, since accepting an
   * invite signs the member in immediately, same as a normal login — unlike that method, this
   * also sets `name`, since the invite-send form is email-only (see `AcceptMemberInviteDto`'s own
   * comment). See `completeMemberInviteGoogle` for the Google alternative.
   */
  async acceptMemberInvite(dto: AcceptMemberInviteDto): Promise<TokenIssuanceResult> {
    // Checked *before* redemption, not left to `buildTokenIssuanceResult`'s own `assertGoodStanding`
    // at the end. Both refuse a suspended tenant, but only this order refuses it without having
    // already burned the invite: reaching the check after the transaction commits leaves the member
    // activated, the token consumed, and the link dead, so the invite is spent on a join that was
    // never allowed to happen. Same reason `completeMemberInviteGoogle` checks at the same point.
    await this.assertMemberInviteTenantActive(hashToken(dto.token));

    const passwordHash = await this.hashingService.hash(dto.password);
    const result = await this.authDbService.acceptMemberInviteWithPassword({
      tokenHash: hashToken(dto.token),
      name: dto.name,
      passwordHash,
    });

    if (result.outcome !== 'accepted') {
      throw new InvalidOrExpiredInviteException();
    }

    return this.buildTokenIssuanceResult({
      id: result.id,
      tenantId: result.tenantId,
      email: result.email,
      name: result.name,
      role: UserRole.MEMBER,
      passwordHash,
      status: UserStatus.ACTIVE,
      locale: null,
    });
  }

  /**
   * `GET /v1/auth/invite/:token/google` — the same read-only shape `buildGoogleAuthorizeRedirect`
   * uses (never throws for an expected failure, since the browser is mid-navigation): validates
   * the token before ever redirecting to Google, so a dead link fails fast on the accept screen
   * rather than after a round trip that can only fail there anyway. Mirrors
   * `PlatformAdminAuthService.buildAdminInviteGoogleRedirect`.
   */
  async buildMemberInviteGoogleRedirect(inviteToken: string): Promise<GoogleAuthorizeRedirect> {
    const invite = await this.authDbService.findMemberInviteEmailByTokenHash(
      hashToken(inviteToken)
    );
    if (!invite) {
      return {
        ok: false,
        redirectUrl: this.memberInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    if (!this.googleIdentityProvider.isConfigured()) {
      return {
        ok: false,
        redirectUrl: this.memberInviteFailureUrl(inviteToken, GoogleAuthFailure.NOT_CONFIGURED),
      };
    }

    const { state, sid } = await this.googleOAuthStateService.mint({
      intent: OAuthIntent.INVITE,
      inviteToken,
    });

    return {
      ok: true,
      authorizationUrl: this.googleIdentityProvider.buildAuthorizationUrl(state),
      sid,
    };
  }

  /**
   * Completes an `OAuthIntent.INVITE` round trip: re-validates the invite, confirms the
   * IdP-verified email matches the invited address, links the Google identity, and signs the
   * member in. Never throws — called from the shared callback, which is mid-navigation the same
   * way every other branch there is. Mirrors
   * `PlatformAdminAuthService.completeAdminInviteGoogle` almost exactly; the one difference is
   * `name`, taken from the Google profile here since there is no password-form name field for a
   * Google-only member to have supplied.
   *
   * `inviteToken` is only `undefined` if the state record somehow lost it, which never happens in
   * practice (`buildMemberInviteGoogleRedirect` always mints it alongside `intent`) — handled
   * defensively rather than asserted, since there is no token to build a targeted redirect from
   * either way.
   */
  private async completeMemberInviteGoogle(
    inviteToken: string | undefined,
    identity: GoogleIdentity
  ): Promise<GoogleCallbackOutcome> {
    if (inviteToken === undefined) {
      return {
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: `${GOOGLE_AUTH_REDIRECT.MEMBER_INVITE}?error=${GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE}`,
      };
    }

    const invite = await this.authDbService.findMemberInviteEmailByTokenHash(
      hashToken(inviteToken)
    );
    if (!invite) {
      return {
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: this.memberInviteFailureUrl(
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
        redirectUrl: this.memberInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.INVITE_EMAIL_MISMATCH
        ),
      };
    }

    // A suspended tenant is refused here, as a redirect — never by letting `buildTokenIssuanceResult`
    // below reach `assertGoodStanding` and throw. This method is called from the shared callback
    // with the browser mid-navigation, so a thrown `ForbiddenException` would paint a raw JSON 403
    // as a document instead of returning the invitee to the accept screen with a readable error.
    // Checked before redemption so a refused join does not also burn the invite.
    const tenant = await this.authDbService.findTenantStatus(invite.tenantId);
    if (tenant?.status === TenantStatus.SUSPENDED) {
      return {
        ok: false,
        failure: GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
        redirectUrl: this.memberInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.ACCOUNT_UNAVAILABLE
        ),
      };
    }

    const result = await this.authDbService.acceptMemberInviteWithGoogleIdentity({
      tokenHash: hashToken(inviteToken),
      providerUserId: identity.providerUserId,
      email: identity.email,
      name: identity.name ?? identity.email,
    });

    if (result.outcome === 'identity_already_linked') {
      return {
        ok: false,
        failure: GoogleAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED,
        redirectUrl: this.memberInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED
        ),
      };
    }
    if (result.outcome !== 'accepted') {
      return {
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: this.memberInviteFailureUrl(
          inviteToken,
          GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    const tokens = await this.buildTokenIssuanceResult({
      id: result.id,
      tenantId: result.tenantId,
      email: result.email,
      name: result.name,
      role: UserRole.MEMBER,
      // A Google-accepted member never sets a password — there is nothing to hash.
      passwordHash: null,
      status: UserStatus.ACTIVE,
      locale: null,
    });
    return { ok: true, kind: 'signed_in', tokens };
  }

  /** `${FRONTEND_URL}/accept-invite/:token?error=<code>` — shared by every failure branch above
   *  that has an invite token to target. Public: `googleFailureRedirect` also calls this for the
   *  `INVITE` intent, since that dispatch stays on the shared callback. */
  private memberInviteFailureUrl(inviteToken: string, failure: GoogleAuthFailure): string {
    const link = buildMemberInviteLink(this.configService.get<string>('FRONTEND_URL'), inviteToken);
    return `${link}?error=${failure}`;
  }

  /**
   * Refuses an invite into a suspended tenant before anything is written. A dead token is *not*
   * this method's error to raise — redemption answers that uniformly a moment later, and raising
   * here would give a suspended tenant's invite a different error than every other dead one.
   */
  private async assertMemberInviteTenantActive(tokenHash: string): Promise<void> {
    const invite = await this.authDbService.findMemberInviteEmailByTokenHash(tokenHash);
    if (!invite) {
      return;
    }

    const tenant = await this.authDbService.findTenantStatus(invite.tenantId);
    if (tenant?.status === TenantStatus.SUSPENDED) {
      throw new TenantSuspendedException();
    }
  }

  /**
   * Step one of Google sign-in: mint the state and hand back where to send the browser.
   *
   * No business name here any more — see `completeGoogleSignup`. Both intents mint the same
   * state now; the only thing that ever varied per intent was `businessName`.
   *
   * Returns a result rather than throwing on the one expected failure (an unconfigured Google
   * client): the browser navigated here directly, so `AuthController.googleAuthorize` redirects
   * either way rather than rendering a JSON error body as a document — computing which redirect
   * that is belongs here, not in the controller.
   */
  async buildGoogleAuthorizeRedirect(
    input: GoogleAuthorizeInput
  ): Promise<GoogleAuthorizeRedirect> {
    if (!this.googleIdentityProvider.isConfigured()) {
      const base =
        input.intent === OAuthIntent.SIGNUP
          ? GOOGLE_AUTH_REDIRECT.SIGNUP
          : GOOGLE_AUTH_REDIRECT.LOGIN;
      return { ok: false, redirectUrl: `${base}?error=${GoogleAuthFailure.NOT_CONFIGURED}` };
    }

    const { state, sid } = await this.googleOAuthStateService.mint({ intent: input.intent });

    return {
      ok: true,
      authorizationUrl: this.googleIdentityProvider.buildAuthorizationUrl(state),
      sid,
    };
  }

  /**
   * Step two: everything after Google redirects back. Returns a token pair to set as cookies, a
   * pending-signup cookie value for a genuinely new person, or a failure code for the caller to
   * put on a `?error=` redirect — never throws for an expected failure, because the browser is
   * mid-navigation and would render a JSON body as a document.
   *
   * The state is consumed *before* the code is exchanged, so a replayed callback is rejected
   * without a network round trip to Google.
   */
  async handleGoogleCallback(input: {
    code: string | undefined;
    state: string | undefined;
    error: string | undefined;
    sid: string | undefined;
  }): Promise<GoogleCallbackOutcome> {
    // Consumed before the `error` branch, not after: the state is what carries the intent, and
    // without it a cancelled *signup* was reported with no intent and redirected to /login. It is
    // also single-use regardless of outcome, so a declined consent should still spend it.
    const consumed = await this.googleOAuthStateService.consume(input.state, input.sid);
    const intent = consumed.ok ? consumed.record.intent : undefined;
    const inviteToken = consumed.ok ? consumed.record.inviteToken : undefined;

    if (input.error !== undefined) {
      return this.googleFailureRedirect(GoogleAuthFailure.ACCESS_DENIED, intent, inviteToken);
    }

    if (!consumed.ok) {
      return this.googleFailureRedirect(GoogleAuthFailure.INVALID_STATE);
    }

    if (input.code === undefined || input.code === '') {
      return this.googleFailureRedirect(
        GoogleAuthFailure.PROVIDER_ERROR,
        consumed.record.intent,
        inviteToken
      );
    }

    let identity;
    try {
      identity = await this.googleIdentityProvider.fetchIdentity(input.code);
    } catch (error) {
      this.logger.warn(`Google identity exchange failed: ${(error as Error).message}`);
      return this.googleFailureRedirect(
        GoogleAuthFailure.PROVIDER_ERROR,
        consumed.record.intent,
        inviteToken
      );
    }

    // Refused rather than trusted: an unverified address would let someone claim an account by
    // registering a Google profile against an email they do not control.
    if (!identity.emailVerified) {
      return this.googleFailureRedirect(
        GoogleAuthFailure.EMAIL_NOT_VERIFIED,
        consumed.record.intent,
        inviteToken
      );
    }

    // Structurally distinct from the tenant login/signup branches below: there is no
    // `platform_admin_identities` lookup to attempt (this is always the first time this admin
    // links Google), and completion is entirely about redeeming `inviteToken`, not resolving an
    // identity against `users`. Delegated to `PlatformAdminAuthService` — see that method's own
    // doc comment and `separate-admin-login-design.md` for why admin auth composes into this
    // shared callback rather than owning a callback of its own.
    if (consumed.record.intent === OAuthIntent.ADMIN_INVITE) {
      const outcome = await this.platformAdminAuthService.completeAdminInviteGoogle(
        inviteToken,
        identity
      );
      return outcome.ok
        ? { ok: true, kind: 'admin_signed_in', tokens: outcome.tokens }
        : { ok: false, failure: outcome.failure, redirectUrl: outcome.redirectUrl };
    }

    // The tenant-member counterpart to `ADMIN_INVITE` above, redeeming a `users` row instead of a
    // `platform_admins` one — see `completeMemberInviteGoogle`'s own doc comment for the one real
    // difference (this Google profile's `name` is used, since there is no password-form field a
    // Google-only member would have supplied it in).
    if (consumed.record.intent === OAuthIntent.INVITE) {
      return this.completeMemberInviteGoogle(inviteToken, identity);
    }

    // The admin sign-in screen's own Google button. Resolves against `platform_admin_identities`
    // and stops there: unlike `LOGIN` below, it must never fall through to the tenant tables, or
    // the admin login page would hand back a tenant session to anyone whose Google account
    // happens to have one. `NO_ACCOUNT` (not a silent tenant sign-in) is the right answer for a
    // Google account that isn't a linked admin.
    if (consumed.record.intent === OAuthIntent.ADMIN_LOGIN) {
      const admin = await this.platformAdminAuthService.findLinkedAdmin(identity.providerUserId);
      if (!admin.linked) {
        return this.googleFailureRedirect(GoogleAuthFailure.NO_ACCOUNT, consumed.record.intent);
      }
      if (!admin.active) {
        return this.googleFailureRedirect(
          GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
          consumed.record.intent
        );
      }
      return { ok: true, kind: 'admin_signed_in', tokens: admin.tokens };
    }

    // Tenant resolution happens in two steps with the admin-identity check *between* them, rather
    // than as one call before or after it. The first step matches on Google's `sub` and reads; the
    // second matches on email and writes (see `linkGoogleIdentityByEmail`). Which accounts may
    // reach that second step is the security decision this ordering exists to express.
    const email = normalizeEmail(identity.email);
    let lookup = await this.authDbService.findGoogleIdentityBySub(identity.providerUserId);

    if (lookup.kind === 'unknown') {
      // This Google account owns no tenant identity of its own. A linked platform admin takes the
      // request from here — *before* the email fallback below, which matches on address alone.
      // An admin's address is exactly what an attacker can seed a `pending_verification` signup
      // with (nothing proves a mailbox before the OTP), so letting that fallback run for an admin
      // would silently enrol them as owner of a tenant they never created, named by whoever
      // seeded it.
      const linkedAdmin = await this.platformAdminAuthService.findLinkedAdmin(
        identity.providerUserId
      );

      if (linkedAdmin.linked) {
        // A platform admin signing up their own separate tenant business is legitimate and
        // intentional — the dual-identity decision in `separate-admin-login-design.md` — so this
        // mints a brand-new tenant instead of handing back an admin session. An earlier version
        // of this method checked the admin identity first for *both* intents, which meant an
        // admin could never sign up a tenant at all: the admin session always won.
        //
        // Admin status is deliberately not consulted here: being disabled as a platform admin is
        // not a reason to refuse someone a customer account. A tenant signup that stalled under
        // this same address is not adopted either — it cannot be told apart from a seeded one,
        // and a fresh tenant the admin names themselves is the safe answer.
        if (consumed.record.intent === OAuthIntent.SIGNUP) {
          return this.mintPendingGoogleSignup(identity, email);
        }

        if (!linkedAdmin.active) {
          return this.googleFailureRedirect(
            GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
            consumed.record.intent
          );
        }

        // Without this, an admin who accepted their invite through Google could sign in exactly
        // once: no `password_hash` to log in with, no refresh token for that principal type, and
        // no way to revoke or re-issue the invite afterwards (both paths are scoped to
        // `status = 'invited'`).
        return { ok: true, kind: 'admin_signed_in', tokens: linkedAdmin.tokens };
      }

      // Not an admin, so the email fallback is safe to run: it links this Google account to the
      // tenant user already holding the address, finishing a signup that stalled at the OTP
      // screen and dropping the unproven password that stall left behind.
      lookup = await this.authDbService.linkGoogleIdentityByEmail({
        providerUserId: identity.providerUserId,
        email,
      });

      if (lookup.kind === 'unknown') {
        if (consumed.record.intent === OAuthIntent.SIGNUP) {
          return this.mintPendingGoogleSignup(identity, email);
        }
        // Login can never create a tenant it has no name for.
        return this.googleFailureRedirect(GoogleAuthFailure.NO_ACCOUNT, consumed.record.intent);
      }
    }

    // The same standing check password login applies (`login`, above) and refresh re-applies
    // (`TokenService.rotate`). Without it a disabled account could still sign in through the
    // Google button — the one entry point that never looked at `users.status`.
    if (lookup.user.status === UserStatus.DISABLED) {
      return this.googleFailureRedirect(
        GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
        consumed.record.intent
      );
    }

    const tenant = await this.authDbService.findTenantStatus(lookup.user.tenantId);
    if (tenant?.status === TenantStatus.SUSPENDED) {
      return this.googleFailureRedirect(
        GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
        consumed.record.intent
      );
    }

    // The Google-linking equivalent of `verifyEmail` returning non-null — see
    // `GoogleIdentityLookup.firstActivation`'s own comment for why this is the one reliable
    // "a brand-new tenant just finished signing up" signal on this path.
    if (lookup.firstActivation) {
      this.seedDemoDataIfDev({ userId: lookup.user.id, tenantId: lookup.user.tenantId });
    }

    const tokens = await this.buildTokenIssuanceResult(lookup.user, tenant);
    return { ok: true, kind: 'signed_in', tokens };
  }

  /**
   * Hands a verified-but-unknown Google identity back to the caller to collect the one thing
   * Google cannot supply — a business name — which `completeGoogleSignup` then turns into a
   * tenant. Reached from the two places a `signup` round trip can find no tenant identity to sign
   * into: a Google account belonging to a platform admin, and one belonging to nobody yet.
   */
  private async mintPendingGoogleSignup(
    identity: GoogleIdentity,
    email: string
  ): Promise<GoogleCallbackOutcome> {
    const pendingSignupCookie = await this.pendingGoogleSignupService.mint({
      providerUserId: identity.providerUserId,
      email,
      name: identity.name,
    });
    return { ok: true, kind: 'needs_business_name', pendingSignupCookie };
  }

  /**
   * Builds the `?error=` redirect target for a callback failure — moved here (out of
   * `AuthController.googleCallback`) so the controller's job stays "read `ok`, act," with no
   * `intent`-to-URL mapping of its own. Defaults to the login page: everywhere this is called
   * without a known `intent`, the state was never validly consumed, so there is no way to know
   * the original screen and the login page is the safer fallback (it never invents a tenant).
   *
   * `ADMIN_INVITE` targets the accept-invite page itself, not `/login`/`/onboarding/signup` — but
   * only when `inviteToken` actually came back with the consumed record; if it somehow didn't
   * (never happens in practice — `PlatformAdminAuthService.buildAdminInviteGoogleRedirect` always
   * mints it), this falls through to the login-page default rather than building a URL with no
   * token in it. This is the one place `AuthService` still calls into the admin service for a
   * plain URL-building helper, since every *intent-agnostic* failure above (bad state, missing
   * code, unverified email) reaches this method before `handleGoogleCallback` ever branches on
   * `ADMIN_INVITE` — only the identity-resolution failures further down are handled entirely
   * inside `completeAdminInviteGoogle` without ever coming back through here.
   */
  private googleFailureRedirect(
    failure: GoogleAuthFailure,
    intent?: OAuthIntent,
    inviteToken?: string
  ): GoogleCallbackOutcome {
    if (intent === OAuthIntent.ADMIN_INVITE && inviteToken !== undefined) {
      return {
        ok: false,
        failure,
        redirectUrl: this.platformAdminAuthService.adminInviteFailureUrl(inviteToken, failure),
      };
    }

    if (intent === OAuthIntent.INVITE && inviteToken !== undefined) {
      return { ok: false, failure, redirectUrl: this.memberInviteFailureUrl(inviteToken, failure) };
    }

    // Admin-context failures land on the admin sign-in screen. `LOGIN` would be a dead end: since
    // the split it carries no admin path at all, so an admin sent there sees the error and then
    // has nothing to do with it. `ADMIN_INVITE`/`INVITE` only reach here when their token went
    // missing — with one, the branches above target the accept screen instead.
    const base =
      intent === OAuthIntent.SIGNUP
        ? GOOGLE_AUTH_REDIRECT.SIGNUP
        : intent === OAuthIntent.ADMIN_LOGIN || intent === OAuthIntent.ADMIN_INVITE
          ? GOOGLE_AUTH_REDIRECT.ADMIN_LOGIN
          : intent === OAuthIntent.INVITE
            ? GOOGLE_AUTH_REDIRECT.MEMBER_INVITE
            : GOOGLE_AUTH_REDIRECT.LOGIN;
    return { ok: false, failure, redirectUrl: `${base}?error=${failure}` };
  }

  /**
   * The screen after `needs_business_name` submits here: the one thing Google could not supply,
   * against the identity it already verified at the callback. `pendingSignupCookie` is the value
   * of the `google_pending_signup` cookie the callback set — see PendingGoogleSignupService for
   * why that alone (no separate browser-binding cookie) is enough here.
   */
  async completeGoogleSignup(
    pendingSignupCookie: string | undefined,
    businessName: string
  ): Promise<TokenIssuanceResult> {
    const pending = await this.pendingGoogleSignupService.consume(pendingSignupCookie);
    if (!pending.ok) {
      throw new GooglePendingSignupExpiredException();
    }

    const user = await this.authDbService.completeGoogleSignup({
      providerUserId: pending.identity.providerUserId,
      email: pending.identity.email,
      name: pending.identity.name,
      businessName,
    });

    if (user === null) {
      // Someone else registered this exact email in the window between the callback and this
      // call — a password signup, or a second Google round trip for the same address.
      throw new EmailAlreadyRegisteredException();
    }

    // Unconditional here (unlike the other two hooks) — `completeGoogleSignup` only ever reaches
    // this point by inserting a brand-new tenant, never by promoting an existing row.
    this.seedDemoDataIfDev({ userId: user.id, tenantId: user.tenantId });

    return this.buildTokenIssuanceResult(user);
  }

  /**
   * The one gate every token-minting path goes through, so none can skip the standing checks.
   *
   * `JwtStrategy` deliberately does no DB lookup (a per-request status query is the cost the
   * refresh-time check exists to avoid), which means a live access token is honored for its full
   * 15 minutes regardless of what happens to the account behind it. That bound is only real if
   * nothing hands out *fresh* tokens to a principal who has lost standing — and
   * `changePassword`/`setPassword` did exactly that: both are authenticated by an access token,
   * neither looked at status, and both return a new pair. A disabled user could call
   * change-password with their current password (nothing requires the new one to differ) every
   * ten minutes and renew indefinitely, making the documented "suspension takes effect within one
   * access-token lifetime" false.
   *
   * Same exceptions password login raises, so the two can never disagree about the same account.
   */
  private async assertGoodStanding(status: UserStatus, tenant: TenantRow | null): Promise<void> {
    if (status === UserStatus.DISABLED) {
      throw new AccountDisabledException();
    }

    if (tenant?.status === TenantStatus.SUSPENDED) {
      throw new TenantSuspendedException();
    }

    return Promise.resolve();
  }

  private async buildTokenIssuanceResult(
    user: {
      id: string;
      tenantId: string;
      email: string;
      name: string;
      role: UserRole;
      passwordHash: string | null;
      status: UserStatus;
      locale: Locale | null;
    },
    tenant?: TenantRow | null
  ): Promise<TokenIssuanceResult> {
    const standing =
      tenant === undefined ? await this.authDbService.findTenantStatus(user.tenantId) : tenant;
    await this.assertGoodStanding(user.status, standing);

    const tokens = await this.tokenService.issueTokenPair(user);
    return this.toTokenIssuanceResult(tokens, user, standing);
  }

  /**
   * `tenant` is optional so the callers that already looked the row up for a suspension check
   * (`login`, the Google callback, `TokenService.rotate` via `refresh`) can hand it over instead
   * of paying for a second identical single-row query per sign-in.
   */
  private async toTokenIssuanceResult(
    tokens: { accessToken: string; refreshToken: string; expiresIn: number },
    user: {
      id: string;
      tenantId: string;
      email: string;
      name: string;
      role: UserRole;
      passwordHash: string | null;
      locale: Locale | null;
    },
    prefetchedTenant?: TenantRow | null
  ): Promise<TokenIssuanceResult> {
    const [hasConnectedBusiness, tenant, avatarUrl] = await Promise.all([
      this.authDbService.hasConnectedBusiness(user.tenantId),
      prefetchedTenant === undefined
        ? this.authDbService.findTenantStatus(user.tenantId)
        : Promise.resolve(prefetchedTenant),
      this.mediaService.getUserAvatarUrl(user.id),
    ]);

    const userDto = this.toAuthenticatedUserDto(user, tenant, avatarUrl);

    const body = new TokenResponseDto();
    body.accessToken = tokens.accessToken;
    body.expiresIn = tokens.expiresIn;
    body.user = userDto;
    body.hasConnectedBusiness = hasConnectedBusiness;

    return { body, refreshToken: tokens.refreshToken };
  }

  /** Shared by token issuance and `me`, so the two can never disagree about the same account. */
  private toAuthenticatedUserDto(
    user: {
      id: string;
      tenantId: string;
      email: string;
      name: string;
      role: UserRole;
      passwordHash: string | null;
      locale: Locale | null;
    },
    tenant: TenantRow | null,
    avatarUrl: string | null
  ): AuthenticatedUserDto {
    const userDto = new AuthenticatedUserDto();
    userDto.id = user.id;
    userDto.tenantId = user.tenantId;
    userDto.name = user.name;
    userDto.email = user.email;
    userDto.role = user.role;
    userDto.hasPassword = user.passwordHash !== null;
    userDto.locale = user.locale;
    userDto.avatarUrl = avatarUrl;
    // `tenant` is only ever null if the row vanished mid-request (tenant deletion mid-flight) —
    // an empty string here is a display gap, not a reason to fail token issuance over it.
    userDto.businessName = tenant?.name ?? '';
    return userDto;
  }

  private otpExpiresAt(): Date {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  /**
   * Fire-and-forget: the transaction that issued this code already committed, so a queue-publish
   * failure shouldn't fail the whole request — the resend path (login, or an explicit resend
   * click) is exactly the recovery mechanism for "the email never arrived."
   */
  /**
   * Dev-only, best-effort, fire-and-forget — same shape as `sendOtpEmail`: called without
   * `await`, and its own failure must never surface as a failed signup. Gated on `!isProduction()`
   * alone (no separate opt-in flag, unlike `DEV_VERIFY_EMAIL_TOKEN`): there is no legitimate
   * reason to want fabricated reviews in a deployed environment, so there is nothing to opt into.
   *
   * Shared by all three ways a tenant can finish signing up: `verifyEmail` (password + OTP),
   * `handleGoogleCallback` (Google-linking an existing `pending_verification` row), and
   * `completeGoogleSignup` (a brand-new Google-only tenant). Each caller has already established
   * this is a genuine first activation before calling in — this method itself doesn't re-check
   * that, only the environment gate.
   */
  private seedDemoDataIfDev(input: SeedDemoDataIfDevInput): void {
    const { userId, tenantId } = input;
    if (isProduction()) return;

    void (async (): Promise<void> => {
      try {
        const tenant = await this.authDbService.findTenantStatus(tenantId);
        if (!tenant) return;

        await this.demoDataDbService.seedForTenant({
          tenantId,
          userId,
          businessName: tenant.name,
        });
      } catch (error) {
        this.logger.warn(
          `Demo data seeding failed for tenant ${tenantId} (non-fatal, dev-only): ${(error as Error).message}`
        );
      }
    })();
  }

  private sendOtpEmail(input: SendOtpEmailInput): void {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    const job: IOtpEmailJob = {
      email: input.email,
      customerName: input.customerName,
      otp: input.rawOtp,
      expiresIn: `${ttlMinutes} minutes`,
    };
    void this.queueManager
      .addRegisterationOtpEmailJob(JobName.OTP_EMAIL_VERIFICATION, job)
      .catch(() => undefined);
  }
}
