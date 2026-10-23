import { JobName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import type { Locale } from '@common/i18n/locale';
import { EnvConfig } from '@config/env.config';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { SsoEmailLinkResult, TenantRow } from '@db/repositories/auth/types/auth.type';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { MediaService } from '@media/media.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import { LoginAttemptScope, LoginAttemptService } from './login-attempt.service';
import { OAuthStateService } from './oauth-state.service';
import { OtpAttemptService } from './otp-attempt.service';
import { PendingSsoSignupService } from './pending-sso-signup.service';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { SessionRevocationService } from './session-revocation.service';
import { SignupBindingService } from './signup-binding.service';
import { TokenService } from './token.service';

import { SSO_REDIRECT, SsoAuthFailure, SsoProvider } from '../constants/sso-auth.constants';
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
import { OtpScope } from '../enums/otp-scope.enum';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import {
  AccountDisabledException,
  AccountScheduledForDeletionException,
  EmailAlreadyRegisteredException,
  EmailQueueUnavailableException,
  InvalidAccessTokenException,
  InvalidCredentialsException,
  InvalidCurrentPasswordException,
  InvalidOrExpiredInviteException,
  InvalidOtpException,
  InviteNotFoundException,
  NewPasswordSameAsCurrentException,
  NoPasswordSetException,
  PasswordAlreadySetException,
  PasswordSignupDisabledException,
  SsoPendingSignupExpiredException,
  SsoSignupDisabledException,
  TenantSuspendedException,
} from '../exceptions/auth.exceptions';
import { GoogleIdentityProvider } from '../providers/google-identity.provider';
import { MicrosoftIdentityProvider } from '../providers/microsoft-identity.provider';
import { VerifyEmailTokenProvider } from '../providers/verify-email-token.provider';
import type {
  AuthUser,
  IssueOtpInput,
  PendingVerificationLoginResult,
  SendOtpEmailInput,
  SignupIssuanceResult,
  SsoAuthorizeInput,
  SsoAuthorizeRedirect,
  SsoCallbackInput,
  SsoCallbackOutcome,
  SsoIdentity,
  TokenIssuanceResult,
} from '../types/auth.type';
import { normalizeEmail } from '../utils/email.utils';
import { buildMemberInviteLink } from '../utils/member-invite-link.util';
import { remainingSessionSeconds } from '../utils/remaining-session-seconds.util';
import { requireTenantUser } from '../utils/require-tenant-user.util';
import { isTenantLoginBlocked } from '../utils/tenant-status.util';
import { hashToken } from '../utils/token.utils';

/**
 * Only an explicit `access_denied` means the person backed out; anything else the provider reports (`server_error`,
 * `temporarily_unavailable`, a consent-policy error) is a failure on its side, and "cancelled" would mislead.
 */
function providerErrorFailure(error: string): SsoAuthFailure {
  return error === 'access_denied' ? SsoAuthFailure.ACCESS_DENIED : SsoAuthFailure.PROVIDER_ERROR;
}

/**
 * Intents a tenant starts from the sign-in, sign-up or invite screens, which the platform's Google switch governs. The admin intents are
 * deliberately not here: an admin who accepted their invite through Google has no password, so that button must always work for them
 * (`AdminSettingsService` refuses to switch Google off for the same reason).
 */
function isTenantGoogleIntent(intent: OAuthIntent): boolean {
  return (
    intent === OAuthIntent.LOGIN || intent === OAuthIntent.SIGNUP || intent === OAuthIntent.INVITE
  );
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
    private readonly microsoftIdentityProvider: MicrosoftIdentityProvider,
    private readonly oauthStateService: OAuthStateService,
    private readonly pendingSsoSignupService: PendingSsoSignupService,
    private readonly platformAdminAuthService: PlatformAdminAuthService,
    private readonly mediaService: MediaService,
    private readonly platformSettingsDbService: PlatformSettingsDbService,
    private readonly sessionRevocationService: SessionRevocationService,
    private readonly signupBindingService: SignupBindingService
  ) {}

  /**
   * A real hash of an unknown value, compared against when no account matched, so the miss path
   * costs the same bcrypt work as the hit path. Computed once and reused.
   */
  private decoyHash?: Promise<string>;

  private decoyPasswordHash(): Promise<string> {
    this.decoyHash ??= this.hashingService.hash(randomBytes(32).toString('hex'));
    return this.decoyHash;
  }

  /**
   * Deliberately does NOT check whether this email belongs to a platform admin: the same address
   * may be both a platform admin and, separately, a tenant owner (two unrelated accounts).
   * `AdminSettingsService.sendInvite` has no mirror guard either.
   */
  async signup(dto: SignupDto): Promise<SignupIssuanceResult> {
    // The platform's password switch, enforced here and not only by hiding the form. It covers new sign-ups only: someone who already
    // has a password still signs in, changes it and accepts invites, so switching it off never locks anyone out.
    if (!(await this.isPasswordSignupEnabled())) {
      throw new PasswordSignupDisabledException();
    }

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

    // Not awaited for its result: the account is saved and the person can ask for another code at once (no cooldown was claimed).
    await this.sendOtpEmail({ email, customerName: result.ownerName, rawOtp });

    return {
      body: SignupResponseDto.from(result, MESSAGES.AUTH.SIGNUP_OTP_SENT(email)),
      // Only this browser may finish the verification: whoever signs up for an address does not necessarily own its mailbox.
      signupBinding: this.signupBindingService.issue({ id: result.userId, passwordHash }),
    };
  }

  /**
   * Issuing tokens here is safe because the OTP screen is only reached after the caller proved the
   * password in this flow (signup or login), and a code, unlike a link, cannot be prefetched by an
   * email scanner.
   */
  async verifyEmail(
    dto: VerifyEmailDto,
    signupBinding: string | undefined
  ): Promise<TokenIssuanceResult> {
    const email = normalizeEmail(dto.email);

    // Before the budget is touched: a stranger without this browser's binding gets the wrong-code answer without spending the address's
    // attempts, so nobody can lock a pending sign-up's owner out of verifying by hammering the endpoint. (They cannot guess the code
    // either way: the comparison below is never reached without the binding.)
    // The code proves the mailbox, not who chose the password: a stranger can start a sign-up for someone else's address, and its owner
    // then receives the code. So this browser must also hold the binding issued to whoever proved the password (sign-up, or a login
    // with it). Answered exactly like a wrong code, so nothing says whether the address has a pending sign-up.
    const pending = await this.authDbService.findUserForLogin(email);
    if (
      pending?.status === UserStatus.PENDING_VERIFICATION &&
      !this.signupBindingService.matches(pending, signupBinding)
    ) {
      throw new InvalidOtpException();
    }

    // Budget is spent before the code is compared, so an exhausted account can't be probed at all;
    // the per-IP throttle alone doesn't cover this.
    if (
      !(await this.otpAttemptService.consumeAttempt({
        scope: OtpScope.VERIFY_EMAIL,
        identity: email,
      }))
    ) {
      throw new HttpException(MESSAGES.AUTH.TOO_MANY_OTP_ATTEMPTS, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.authDbService.verifyEmail({ email, tokenHash: hashToken(dto.otp) });

    if (!user) {
      throw new InvalidOtpException();
    }

    await this.otpAttemptService.reset({ scope: OtpScope.VERIFY_EMAIL, identity: email });

    return this.buildTokenIssuanceResult(user);
  }

  /**
   * Credentials are checked before branching on status, so `pending_verification` is only revealed
   * to someone who proved the password. Tenant users only; platform admins use `POST
   * /v1/admin/auth/login`.
   */
  async login(dto: LoginDto): Promise<PendingVerificationLoginResult | TokenIssuanceResult> {
    const email = normalizeEmail(dto.email);

    // Per-account ceiling, checked before any DB work: the per-IP throttle doesn't stop credential
    // stuffing spread across addresses. A locked address still pays one decoy comparison and gets
    // the identical INVALID_CREDENTIALS; a faster response or a distinct "locked" code would be a
    // tell.
    if (await this.loginAttemptService.isLockedOut(email, LoginAttemptScope.TENANT)) {
      await this.hashingService.compare(dto.password, await this.decoyPasswordHash());
      throw new InvalidCredentialsException();
    }

    const user = await this.authDbService.findUserForLogin(email);

    // Always pay for one password comparison, even with no account or an SSO-only one: short-
    // circuiting returns in ~1ms vs ~100ms of bcrypt, a timing oracle for registered addresses.
    const passwordMatches = await this.hashingService.compare(
      dto.password,
      user?.passwordHash ?? (await this.decoyPasswordHash())
    );

    if (!user?.passwordHash || !passwordMatches) {
      await this.loginAttemptService.recordFailure(email, LoginAttemptScope.TENANT);
      throw new InvalidCredentialsException();
    }

    // Cleared before the status branches: a pending_verification or suspended account that typed
    // the right password should not keep burning attempts.
    await this.loginAttemptService.reset(email, LoginAttemptScope.TENANT);

    if (user.status === UserStatus.DISABLED) {
      throw new AccountDisabledException();
    }

    const tenant = await this.authDbService.findTenantStatus(user.tenantId);
    if (isTenantLoginBlocked(tenant)) {
      throw await this.blockedLoginException(user);
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      await this.issueOtp({ userId: user.id, email, name: user.name });

      const response = new LoginPendingVerificationDto();
      response.status = UserStatus.PENDING_VERIFICATION;
      response.email = email;
      response.message = MESSAGES.AUTH.LOGIN_OTP_SENT(email);
      // The password was just proven, so this browser may finish the verification (and one that cannot prove it cannot).
      return {
        pendingVerification: true,
        body: response,
        signupBinding: this.signupBindingService.issue({
          id: user.id,
          passwordHash: user.passwordHash,
        }),
      };
    }

    return this.buildTokenIssuanceResult(user, tenant);
  }

  /**
   * A suspension is the generic `TENANT_SUSPENDED`, except an erasure this very user requested,
   * which is named (with its deadline) so the web can offer to restore.
   */
  private async blockedLoginException(user: {
    id: string;
    tenantId: string;
  }): Promise<AccountScheduledForDeletionException | TenantSuspendedException> {
    const state = await this.authDbService.findTenantErasureState(user.tenantId);
    if (
      state?.status === TenantStatus.SUSPENDED &&
      state.erasureRequestedAt &&
      state.erasureRequestedByUserId === user.id
    ) {
      const graceMs = getErasureGracePeriodDays(this.configService) * 86_400_000;
      const deadline = new Date(new Date(state.erasureRequestedAt).getTime() + graceMs);
      // Past the deadline the purge may already have released resources, so there is nothing left
      // to offer.
      if (deadline.getTime() > Date.now()) {
        return new AccountScheduledForDeletionException(deadline);
      }
    }
    return new TenantSuspendedException();
  }

  /**
   * Takes no password (the stepper's resend never did), so it always returns the same generic
   * acknowledgement to prevent email enumeration.
   */
  async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    const email = normalizeEmail(dto.email);
    const user = await this.authDbService.findUserForLogin(email);

    if (user?.status === UserStatus.PENDING_VERIFICATION) {
      await this.issueOtp({ userId: user.id, email, name: user.name });
    }

    return { message: MESSAGES.AUTH.RESEND_OTP_ACK };
  }

  async refresh(rawRefreshToken: string): Promise<TokenIssuanceResult> {
    const { tokens, user, tenant } = await this.tokenService.rotate(rawRefreshToken);
    return this.toTokenIssuanceResult(tokens, user, tenant);
  }

  /**
   * Driven by the refresh cookie, not the access token: the session that most needs revoking is one
   * idle past the 15-minute access TTL, which an access-guarded route would 401 on. Idempotent; a
   * missing or unverifiable cookie still succeeds, revealing nothing.
   */
  /**
   * Ends the refresh token's sessions and any access token presented with it. The access tokens matter most for a platform admin,
   * who has no refresh token, so without them a logout would only clear cookies and leave a copied token valid until it expires.
   */
  async logout(input: {
    refreshToken: string | undefined;
    accessTokens: string[];
  }): Promise<{ message: string }> {
    if (input.refreshToken) {
      await this.tokenService.revokeBySessionToken(input.refreshToken);
    }
    for (const accessToken of new Set(input.accessTokens)) {
      await this.tokenService.revokeByAccessToken(accessToken);
    }
    return { message: MESSAGES.AUTH.LOGGED_OUT };
  }

  /**
   * Password hash change and wholesale session revoke share one DB transaction; a fresh pair keeps
   * this tab signed in.
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

    // The same per-account budget as sign-in. A session (or a stolen access token) could otherwise guess the current password through this
    // route at its per-IP rate, with no per-account ceiling at all; the answer when locked is the same as for a wrong password.
    const budgetKey = normalizeEmail(user.email);
    if (await this.loginAttemptService.isLockedOut(budgetKey, LoginAttemptScope.TENANT)) {
      throw new InvalidCurrentPasswordException();
    }
    const currentMatches = await this.hashingService.compare(
      dto.currentPassword,
      user.passwordHash
    );
    if (!currentMatches) {
      await this.loginAttemptService.recordFailure(budgetKey, LoginAttemptScope.TENANT);
      throw new InvalidCurrentPasswordException();
    }
    await this.loginAttemptService.reset(budgetKey, LoginAttemptScope.TENANT);
    // After the current password is proven, so this cannot be used to probe it. Changing to the same password would
    // still sign every other device out.
    if (dto.newPassword === dto.currentPassword) {
      throw new NewPasswordSameAsCurrentException();
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    // The mark goes first, as in `TokenService.revokeAll`: a refresh rotating at this moment re-checks it once its successor is stored, so
    // it must already exist by the time the revoking UPDATE (which cannot see that successor) has run. It ends the access tokens already
    // issued; the caller's fresh pair follows at once, so tokens issued in this very second are spared.
    await this.sessionRevocationService.revokeUser(user.id, { exceptCurrentSecond: true });
    await this.authDbService.updatePasswordAndRevokeSessions({
      userId: user.id,
      passwordHash: newPasswordHash,
    });
    // Again after the UPDATE: if the clock crossed into the next second between the two, a rotation that started in that second compares
    // against this fresher mark, and the first write alone would not have covered it.
    await this.sessionRevocationService.revokeUser(user.id, { exceptCurrentSecond: true });

    return this.buildTokenIssuanceResult({ ...user, passwordHash: newPasswordHash });
  }

  /**
   * Read from the DB per request rather than from client-side state, which can be stale or wrong.
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
   * For accounts without a password (SSO-only): proves intent with the OTP from
   * `requestSetPasswordOtp`, since an access token alone must not be convertible into a permanent
   * credential.
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

    // Budget spent before comparison, same as `verifyEmail`.
    if (
      !(await this.otpAttemptService.consumeAttempt({
        scope: OtpScope.SET_PASSWORD,
        identity: user.id,
      }))
    ) {
      throw new HttpException(MESSAGES.AUTH.TOO_MANY_OTP_ATTEMPTS, HttpStatus.TOO_MANY_REQUESTS);
    }

    const otpValid = await this.authDbService.consumeSetPasswordOtp({
      userId: user.id,
      tokenHash: hashToken(dto.otp),
    });
    if (!otpValid) {
      throw new InvalidOtpException();
    }
    await this.otpAttemptService.reset({ scope: OtpScope.SET_PASSWORD, identity: user.id });

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    // The mark goes first, as in `TokenService.revokeAll`: a refresh rotating at this moment re-checks it once its successor is stored, so
    // it must already exist by the time the revoking UPDATE (which cannot see that successor) has run. It ends the access tokens already
    // issued; the caller's fresh pair follows at once, so tokens issued in this very second are spared.
    await this.sessionRevocationService.revokeUser(user.id, { exceptCurrentSecond: true });
    await this.authDbService.updatePasswordAndRevokeSessions({
      userId: user.id,
      passwordHash: newPasswordHash,
    });
    // Again after the UPDATE: if the clock crossed into the next second between the two, a rotation that started in that second compares
    // against this fresher mark, and the first write alone would not have covered it.
    await this.sessionRevocationService.revokeUser(user.id, { exceptCurrentSecond: true });

    return this.buildTokenIssuanceResult({ ...user, passwordHash: newPasswordHash });
  }

  /**
   * Step-up for `setPassword`: proves the caller controls the mailbox, not just a (possibly stolen)
   * access token.
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

    if (
      await this.otpAttemptService.claimResend({ scope: OtpScope.SET_PASSWORD, identity: user.id })
    ) {
      const rawOtp = this.verifyEmailTokenProvider.generate();
      await this.authDbService.putSetPasswordOtp({
        userId: user.id,
        tokenHash: hashToken(rawOtp),
        expiresAt: this.otpExpiresAt().toISOString(),
      });
      if (!(await this.sendOtpEmail({ email: user.email, customerName: user.name, rawOtp }))) {
        // Signed in, so no enumeration to protect: say so, and take the cooldown back so the next click works at once.
        await this.otpAttemptService.releaseResend({
          scope: OtpScope.SET_PASSWORD,
          identity: user.id,
        });
        throw new EmailQueueUnavailableException();
      }
    }

    return { message: MESSAGES.AUTH.SET_PASSWORD_OTP_ACK };
  }

  /**
   * Re-signs only the access token so the new `locale` claim applies immediately, expiring when the presented token does (a
   * locale change is not a way to renew a session). Deliberately not `issueTokenPair`: minting a refresh token on nothing more
   * than an access token would be a security boundary crossing (see `TokenService.reissueAccessToken`). Does not revoke other
   * sessions; a locale is not a security boundary.
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
    // The presenting token's remaining lifetime, never a fresh TTL: see `TokenService.reissueAccessToken`.
    const { accessToken, expiresIn } = this.tokenService.reissueAccessToken(
      updatedUser,
      remainingSessionSeconds(tenantUser.sessionExpiresAt)
    );
    const avatarUrl = await this.mediaService.getUserAvatarUrl(user.id);

    const response = new UpdateLocaleResponseDto();
    response.accessToken = accessToken;
    response.expiresIn = expiresIn;
    response.user = this.toAuthenticatedUserDto(updatedUser, tenant, avatarUrl);
    return response;
  }

  /**
   * The cooldown is not just spam control: `putVerifyEmailToken` upserts, so uncapped issuing would
   * let anyone overwrite a victim's pending code. Returns silently so the caller's response is
   * identical either way.
   */
  private async issueOtp(input: IssueOtpInput): Promise<void> {
    const { userId, email, name } = input;
    if (
      !(await this.otpAttemptService.claimResend({ scope: OtpScope.VERIFY_EMAIL, identity: email }))
    ) {
      return;
    }

    const rawOtp = this.verifyEmailTokenProvider.generate();
    await this.authDbService.putVerifyEmailToken({
      userId,
      tokenHash: hashToken(rawOtp),
      expiresAt: this.otpExpiresAt().toISOString(),
    });
    // The reply is identical either way (no enumeration), but a code that was never sent must not hold the resend cooldown.
    if (!(await this.sendOtpEmail({ email, customerName: name, rawOtp }))) {
      await this.otpAttemptService.releaseResend({ scope: OtpScope.VERIFY_EMAIL, identity: email });
    }
  }

  /** Same generic 404 for a token that never existed, was used, or expired. */
  async validateMemberInvite(rawToken: string): Promise<MemberInvitePreviewDto> {
    const invite = await this.authDbService.findMemberInviteEmailByTokenHash(hashToken(rawToken));
    if (!invite) {
      throw new InviteNotFoundException();
    }
    return MemberInvitePreviewDto.from(invite);
  }

  /**
   * Signs the member in immediately, like `PlatformAdminAuthService.acceptAdminInvite`; also sets
   * `name`, since the invite form is email-only.
   */
  async acceptMemberInvite(dto: AcceptMemberInviteDto): Promise<TokenIssuanceResult> {
    // Checked before redemption so a suspended tenant doesn't burn the invite (member activated,
    // token consumed) before `assertGoodStanding` refuses at the end.
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
   * Never throws for an expected failure (the browser is mid-navigation); validates the token
   * before redirecting so a dead link fails fast on the accept screen.
   */
  async buildMemberInviteGoogleRedirect(inviteToken: string): Promise<SsoAuthorizeRedirect> {
    const invite = await this.authDbService.findMemberInviteEmailByTokenHash(
      hashToken(inviteToken)
    );
    if (!invite) {
      return {
        ok: false,
        redirectUrl: this.memberInviteFailureUrl(
          inviteToken,
          SsoAuthFailure.INVALID_OR_EXPIRED_INVITE
        ),
      };
    }

    if (!this.googleIdentityProvider.isConfigured() || !(await this.isGoogleSignInEnabled())) {
      return {
        ok: false,
        redirectUrl: this.memberInviteFailureUrl(inviteToken, SsoAuthFailure.NOT_CONFIGURED),
      };
    }

    const minted = await this.oauthStateService.mint({
      provider: SsoProvider.GOOGLE,
      intent: OAuthIntent.INVITE,
      inviteToken,
      pkce: true,
    });

    return {
      ok: true,
      authorizationUrl: this.googleIdentityProvider.buildAuthorizationUrl({
        state: minted.state,
        ...(minted.codeChallenge === undefined ? {} : { codeChallenge: minted.codeChallenge }),
      }),
      sid: minted.sid,
    };
  }

  /**
   * Never throws: called from the shared callback, with the browser mid-navigation. `name` comes
   * from the Google profile since a Google-only member has no password form. `inviteToken` is only
   * undefined if the state record lost it; handled defensively, as there is no token to build a
   * targeted redirect from.
   */
  private async completeMemberInviteGoogle(
    inviteToken: string | undefined,
    identity: SsoIdentity
  ): Promise<SsoCallbackOutcome> {
    if (inviteToken === undefined) {
      return {
        ok: false,
        failure: SsoAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: `${SSO_REDIRECT.MEMBER_INVITE}?error=${SsoAuthFailure.INVALID_OR_EXPIRED_INVITE}`,
      };
    }

    const invite = await this.authDbService.findMemberInviteEmailByTokenHash(
      hashToken(inviteToken)
    );
    if (!invite) {
      return {
        ok: false,
        failure: SsoAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: this.memberInviteFailureUrl(
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
        redirectUrl: this.memberInviteFailureUrl(inviteToken, SsoAuthFailure.INVITE_EMAIL_MISMATCH),
      };
    }

    // Refused as a redirect, never by letting `buildTokenIssuanceResult` throw: mid-navigation, a
    // thrown 403 would paint raw JSON. Checked before redemption so a refused join doesn't burn the
    // invite.
    const tenant = await this.authDbService.findTenantStatus(invite.tenantId);
    if (isTenantLoginBlocked(tenant)) {
      return {
        ok: false,
        failure: SsoAuthFailure.ACCOUNT_UNAVAILABLE,
        redirectUrl: this.memberInviteFailureUrl(inviteToken, SsoAuthFailure.ACCOUNT_UNAVAILABLE),
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
        failure: SsoAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED,
        redirectUrl: this.memberInviteFailureUrl(
          inviteToken,
          SsoAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED
        ),
      };
    }
    if (result.outcome !== 'accepted') {
      return {
        ok: false,
        failure: SsoAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: this.memberInviteFailureUrl(
          inviteToken,
          SsoAuthFailure.INVALID_OR_EXPIRED_INVITE
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

  /**
   * `${FRONTEND_URL}/accept-invite/:token?error=<code>`. Public: `ssoFailureRedirect` calls it
   * too.
   */
  private memberInviteFailureUrl(inviteToken: string, failure: SsoAuthFailure): string {
    const link = buildMemberInviteLink(this.configService.get<string>('FRONTEND_URL'), inviteToken);
    return `${link}?error=${failure}`;
  }

  /**
   * A dead token is not this method's error to raise: redemption answers that uniformly, and
   * raising here would give a suspended tenant's invite a distinct error.
   */
  private async assertMemberInviteTenantActive(tokenHash: string): Promise<void> {
    const invite = await this.authDbService.findMemberInviteEmailByTokenHash(tokenHash);
    if (!invite) {
      return;
    }

    const tenant = await this.authDbService.findTenantStatus(invite.tenantId);
    if (isTenantLoginBlocked(tenant)) {
      throw new TenantSuspendedException();
    }
  }

  /**
   * Returns a result rather than throwing for an unconfigured Google client: the browser navigated
   * here directly, so the controller must redirect either way.
   */
  async buildGoogleAuthorizeRedirect(input: SsoAuthorizeInput): Promise<SsoAuthorizeRedirect> {
    if (!this.googleIdentityProvider.isConfigured() || !(await this.isGoogleSignInEnabled())) {
      const base = input.intent === OAuthIntent.SIGNUP ? SSO_REDIRECT.SIGNUP : SSO_REDIRECT.LOGIN;
      return {
        ok: false,
        redirectUrl: this.withProviderParam(
          `${base}?error=${SsoAuthFailure.NOT_CONFIGURED}`,
          SsoProvider.GOOGLE
        ),
      };
    }

    const minted = await this.oauthStateService.mint({
      provider: SsoProvider.GOOGLE,
      intent: input.intent,
      pkce: true,
    });

    return {
      ok: true,
      authorizationUrl: this.googleIdentityProvider.buildAuthorizationUrl({
        state: minted.state,
        ...(minted.codeChallenge === undefined ? {} : { codeChallenge: minted.codeChallenge }),
      }),
      sid: minted.sid,
    };
  }

  /**
   * Never throws for an expected failure: the browser is mid-navigation and would render JSON as a
   * document. The state is consumed before the code is exchanged so a replayed callback is rejected
   * without a round trip to Google.
   */
  async handleGoogleCallback(input: SsoCallbackInput): Promise<SsoCallbackOutcome> {
    return this.withFailureProvider(SsoProvider.GOOGLE, await this.processGoogleCallback(input));
  }

  private async processGoogleCallback(input: SsoCallbackInput): Promise<SsoCallbackOutcome> {
    // Consumed before the `error` branch: the state carries the intent (a cancelled signup must
    // redirect to signup, not /login), and it is single-use regardless of outcome.
    const consumed = await this.oauthStateService.consume(
      SsoProvider.GOOGLE,
      input.state,
      input.sid
    );
    const intent = consumed.ok ? consumed.record.intent : undefined;
    const inviteToken = consumed.ok ? consumed.record.inviteToken : undefined;

    if (input.error !== undefined) {
      return this.ssoFailureRedirect(providerErrorFailure(input.error), intent, inviteToken);
    }

    if (!consumed.ok) {
      return this.ssoFailureRedirect(SsoAuthFailure.INVALID_STATE);
    }

    // Re-checked here: the switch may have been turned off while this person was at Google. Only the tenant-facing intents are
    // gated: a platform admin who joined through Google has no other way in, so `ADMIN_LOGIN` and `ADMIN_INVITE` always proceed.
    if (isTenantGoogleIntent(consumed.record.intent) && !(await this.isGoogleSignInEnabled())) {
      return this.ssoFailureRedirect(
        SsoAuthFailure.NOT_CONFIGURED,
        consumed.record.intent,
        inviteToken
      );
    }

    if (input.code === undefined || input.code === '') {
      return this.ssoFailureRedirect(
        SsoAuthFailure.PROVIDER_ERROR,
        consumed.record.intent,
        inviteToken
      );
    }

    let identity;
    try {
      identity = await this.googleIdentityProvider.fetchIdentity(
        input.code,
        // A state minted before PKCE shipped carries no verifier (and no challenge went out for it), so it is exchanged without one.
        consumed.record.codeVerifier === undefined
          ? {}
          : { codeVerifier: consumed.record.codeVerifier }
      );
    } catch (error) {
      this.logger.warn(`Google identity exchange failed: ${(error as Error).message}`);
      return this.ssoFailureRedirect(
        SsoAuthFailure.PROVIDER_ERROR,
        consumed.record.intent,
        inviteToken
      );
    }

    // Refused rather than trusted: an unverified address would let someone claim an account by
    // registering a Google profile against an email they do not control.
    if (!identity.emailVerified) {
      return this.ssoFailureRedirect(
        SsoAuthFailure.EMAIL_NOT_VERIFIED,
        consumed.record.intent,
        inviteToken
      );
    }

    // No `platform_admin_identities` lookup: this is always the first time the admin links Google,
    // and completion is only about redeeming `inviteToken`.
    if (consumed.record.intent === OAuthIntent.ADMIN_INVITE) {
      const outcome = await this.platformAdminAuthService.completeAdminInviteGoogle(
        inviteToken,
        identity
      );
      return outcome.ok
        ? { ok: true, kind: 'admin_signed_in', tokens: outcome.tokens }
        : { ok: false, failure: outcome.failure, redirectUrl: outcome.redirectUrl };
    }

    if (consumed.record.intent === OAuthIntent.INVITE) {
      return this.completeMemberInviteGoogle(inviteToken, identity);
    }

    // Resolves against `platform_admin_identities` only: unlike `LOGIN` it must never fall through
    // to the tenant tables, or the admin login page would hand a tenant session to anyone whose
    // Google account has one. Answers `NO_ACCOUNT` instead.
    if (consumed.record.intent === OAuthIntent.ADMIN_LOGIN) {
      const admin = await this.platformAdminAuthService.findLinkedAdmin(identity.providerUserId);
      if (!admin.linked) {
        return this.ssoFailureRedirect(SsoAuthFailure.NO_ACCOUNT, consumed.record.intent);
      }
      if (!admin.active) {
        return this.ssoFailureRedirect(SsoAuthFailure.ACCOUNT_UNAVAILABLE, consumed.record.intent);
      }
      return { ok: true, kind: 'admin_signed_in', tokens: admin.tokens };
    }

    // Tenant sign-in never looks at platform admins: an admin and a tenant user may share an address (an admin can own a separate
    // business), and the admin console has its own entry (`ADMIN_LOGIN`). An admin using this button is an ordinary tenant sign-in.
    return this.resolveTenantSsoIdentity({
      provider: SsoProvider.GOOGLE,
      identity,
      intent: consumed.record.intent,
    });
  }

  /**
   * The provider-independent tail of a tenant sign-in/sign-up: find by the provider's `sub`, else
   * link by verified email, else (signup) hand back a pending identity or (login) refuse; then the
   * same standing checks as password login. Shared by Google and Microsoft, and never about platform admins.
   */
  private async resolveTenantSsoIdentity(input: {
    provider: SsoProvider;
    identity: SsoIdentity;
    intent: OAuthIntent;
  }): Promise<SsoCallbackOutcome> {
    const { provider, identity, intent } = input;
    const email = normalizeEmail(identity.email);
    let lookup: SsoEmailLinkResult = await this.authDbService.findSsoIdentityBySub(
      provider,
      identity.providerUserId
    );

    if (lookup.kind === 'unknown') {
      // An address decides who someone is only here (first link, or a new tenant), so it must be
      // verified here. A returning identity matched on `sub` above needs no such proof.
      if (!identity.emailVerified) {
        return this.ssoFailureRedirect(SsoAuthFailure.EMAIL_NOT_VERIFIED, intent);
      }

      // Links this provider's identity to the tenant user holding the address, finishing a signup
      // that stalled at the OTP screen and dropping its unproven password.
      lookup = await this.authDbService.linkSsoIdentityByEmail({
        provider,
        providerUserId: identity.providerUserId,
        email,
      });

      if (lookup.kind === 'unknown') {
        if (intent === OAuthIntent.SIGNUP) {
          return this.mintPendingSsoSignup(provider, identity, email);
        }
        // Login can never create a tenant it has no name for.
        return this.ssoFailureRedirect(SsoAuthFailure.NO_ACCOUNT, intent);
      }
    }

    if (lookup.kind === 'invited') {
      return this.ssoFailureRedirect(SsoAuthFailure.INVITE_REQUIRED, intent);
    }

    // Same standing check as password login and `TokenService.rotate`; without it a disabled
    // account could sign in via SSO, the one entry point that never looked at `users.status`.
    if (lookup.user.status === UserStatus.DISABLED) {
      return this.ssoFailureRedirect(SsoAuthFailure.ACCOUNT_UNAVAILABLE, intent);
    }

    const tenant = await this.authDbService.findTenantStatus(lookup.user.tenantId);
    if (isTenantLoginBlocked(tenant)) {
      return this.ssoFailureRedirect(SsoAuthFailure.ACCOUNT_UNAVAILABLE, intent);
    }

    const tokens = await this.buildTokenIssuanceResult(lookup.user, tenant);
    return { ok: true, kind: 'signed_in', tokens };
  }

  /** Tenant sign-in/sign-up with Microsoft; same shape as the Google pair, minus invites and admins. */
  async buildMicrosoftAuthorizeRedirect(input: SsoAuthorizeInput): Promise<SsoAuthorizeRedirect> {
    if (
      !this.microsoftIdentityProvider.isConfigured() ||
      !(await this.isMicrosoftSignInEnabled())
    ) {
      const base = input.intent === OAuthIntent.SIGNUP ? SSO_REDIRECT.SIGNUP : SSO_REDIRECT.LOGIN;
      return {
        ok: false,
        redirectUrl: this.withProviderParam(
          `${base}?error=${SsoAuthFailure.NOT_CONFIGURED}`,
          SsoProvider.MICROSOFT
        ),
      };
    }

    const minted = await this.oauthStateService.mint({
      provider: SsoProvider.MICROSOFT,
      intent: input.intent,
      pkce: true,
    });

    return {
      ok: true,
      authorizationUrl: this.microsoftIdentityProvider.buildAuthorizationUrl({
        state: minted.state,
        nonce: minted.nonce,
        codeChallenge: minted.codeChallenge ?? '',
      }),
      sid: minted.sid,
    };
  }

  /**
   * `platform_settings.google_login_enabled` is the platform's Google switch for tenant sign-in, sign-up and invites; enforced here, not
   * only by hiding the button. The admin intents never consult it (see `isTenantGoogleIntent`). A missing row reads as on (the column
   * default).
   */
  private async isGoogleSignInEnabled(): Promise<boolean> {
    const settings = await this.platformSettingsDbService.get();
    return settings?.googleLoginEnabled !== false;
  }

  /** The same rule for new email/password sign-ups; a missing row reads as on. */
  private async isPasswordSignupEnabled(): Promise<boolean> {
    const settings = await this.platformSettingsDbService.get();
    return settings?.passwordLoginEnabled !== false;
  }

  /**
   * `platform_settings.microsoft_login_enabled` is the platform's Microsoft switch; enforced here, not only by hiding the button, so
   * a bookmarked or crafted URL can't sign anyone in or create a tenant once it is off. A missing row reads as on (the column
   * default).
   */
  private async isMicrosoftSignInEnabled(): Promise<boolean> {
    const settings = await this.platformSettingsDbService.get();
    return settings?.microsoftLoginEnabled !== false;
  }

  /**
   * Never throws for an expected failure (the browser is mid-navigation). The state is consumed
   * before the code is exchanged so a replayed callback is rejected without a round trip.
   */
  async handleMicrosoftCallback(input: SsoCallbackInput): Promise<SsoCallbackOutcome> {
    return this.withFailureProvider(
      SsoProvider.MICROSOFT,
      await this.processMicrosoftCallback(input)
    );
  }

  private async processMicrosoftCallback(input: SsoCallbackInput): Promise<SsoCallbackOutcome> {
    const consumed = await this.oauthStateService.consume(
      SsoProvider.MICROSOFT,
      input.state,
      input.sid
    );
    // Only the intents the Microsoft authorize routes can mint (tenant login/signup, and the admin sign-in
    // route); anything else is not ours to act on.
    const intent =
      consumed.ok &&
      (consumed.record.intent === OAuthIntent.LOGIN ||
        consumed.record.intent === OAuthIntent.SIGNUP ||
        consumed.record.intent === OAuthIntent.ADMIN_LOGIN)
        ? consumed.record.intent
        : undefined;

    if (input.error !== undefined) {
      return this.ssoFailureRedirect(providerErrorFailure(input.error), intent);
    }

    if (!consumed.ok || intent === undefined) {
      return this.ssoFailureRedirect(SsoAuthFailure.INVALID_STATE);
    }

    // Re-checked here: the switch may have been turned off while this person was at Microsoft. The tenant switch
    // governs tenant sign-in only; admin sign-in has its own configuration (see `isAdminMicrosoftConfigured`).
    const isAdminLogin = intent === OAuthIntent.ADMIN_LOGIN;
    const available = isAdminLogin
      ? this.platformAdminAuthService.isAdminMicrosoftConfigured()
      : await this.isMicrosoftSignInEnabled();
    if (!available) {
      return this.ssoFailureRedirect(SsoAuthFailure.NOT_CONFIGURED, intent);
    }

    if (
      input.code === undefined ||
      input.code === '' ||
      consumed.record.codeVerifier === undefined
    ) {
      return this.ssoFailureRedirect(SsoAuthFailure.PROVIDER_ERROR, intent);
    }

    let identity: SsoIdentity;
    try {
      const tenantId = isAdminLogin
        ? this.platformAdminAuthService.adminMicrosoftTenantId()
        : undefined;
      identity = await this.microsoftIdentityProvider.fetchIdentity(input.code, {
        codeVerifier: consumed.record.codeVerifier,
        nonce: consumed.record.nonce,
        ...(tenantId === undefined ? {} : { tenantId }),
      });
    } catch (error) {
      this.logger.warn(`Microsoft identity exchange failed: ${(error as Error).message}`);
      return this.ssoFailureRedirect(SsoAuthFailure.PROVIDER_ERROR, intent);
    }

    if (isAdminLogin) {
      const admin = await this.platformAdminAuthService.signInWithMicrosoft(identity);
      return admin.ok
        ? { ok: true, kind: 'admin_signed_in', tokens: admin.tokens }
        : this.ssoFailureRedirect(admin.failure, intent);
    }

    return this.resolveTenantSsoIdentity({ provider: SsoProvider.MICROSOFT, identity, intent });
  }

  /**
   * Hands a verified-but-unknown Google identity back so the caller can collect the business name
   * Google can't supply (see `completeSsoSignup`).
   */
  private async mintPendingSsoSignup(
    provider: SsoProvider,
    identity: SsoIdentity,
    email: string
  ): Promise<SsoCallbackOutcome> {
    const pendingSignupCookie = await this.pendingSsoSignupService.mint({
      provider,
      providerUserId: identity.providerUserId,
      email,
      name: identity.name,
    });
    return { ok: true, kind: 'needs_business_name', pendingSignupCookie };
  }

  /**
   * Tells the web which provider's copy to show: the same code reads differently for Google
   * ("verify it with Google") and Microsoft ("ask your admin to set the account's email").
   */
  private withProviderParam(redirectUrl: string, provider: SsoProvider): string {
    return `${redirectUrl}&provider=${provider}`;
  }

  private withFailureProvider(
    provider: SsoProvider,
    outcome: SsoCallbackOutcome
  ): SsoCallbackOutcome {
    return outcome.ok
      ? outcome
      : { ...outcome, redirectUrl: this.withProviderParam(outcome.redirectUrl, provider) };
  }

  /**
   * Defaults to the login page: with no known `intent` the state was never validly consumed, so the
   * original screen is unknown and login is the safe fallback (it never invents a tenant).
   * `ADMIN_INVITE` targets the accept-invite page only when `inviteToken` came back with the
   * consumed record.
   */
  private ssoFailureRedirect(
    failure: SsoAuthFailure,
    intent?: OAuthIntent,
    inviteToken?: string
  ): SsoCallbackOutcome {
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

    // Admin-context failures land on the admin sign-in screen: `LOGIN` carries no admin path, so an
    // admin sent there is stuck. `ADMIN_INVITE`/`INVITE` only reach here when their token went
    // missing.
    const base =
      intent === OAuthIntent.SIGNUP
        ? SSO_REDIRECT.SIGNUP
        : intent === OAuthIntent.ADMIN_LOGIN || intent === OAuthIntent.ADMIN_INVITE
          ? SSO_REDIRECT.ADMIN_LOGIN
          : intent === OAuthIntent.INVITE
            ? SSO_REDIRECT.MEMBER_INVITE
            : SSO_REDIRECT.LOGIN;
    return { ok: false, failure, redirectUrl: `${base}?error=${failure}` };
  }

  /** `pendingSignupCookie` is the `sso_pending_signup` cookie value set by the callback. */
  async completeSsoSignup(
    pendingSignupCookie: string | undefined,
    businessName: string
  ): Promise<TokenIssuanceResult> {
    const pending = await this.pendingSsoSignupService.consume(pendingSignupCookie);
    if (!pending.ok) {
      throw new SsoPendingSignupExpiredException();
    }

    // The callback that minted this pending sign-up checked the switch, but it can be turned off during the (up to 15 minute) business
    // name step, and this is the step that actually creates the tenant.
    const providerEnabled =
      pending.identity.provider === SsoProvider.GOOGLE
        ? await this.isGoogleSignInEnabled()
        : await this.isMicrosoftSignInEnabled();
    if (!providerEnabled) {
      throw new SsoSignupDisabledException();
    }

    const user = await this.authDbService.completeSsoSignup({
      provider: pending.identity.provider,
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

    return this.buildTokenIssuanceResult(user);
  }

  /**
   * The one gate every token-minting path goes through. `JwtStrategy` does no DB lookup, so a live
   * access token is honored for 15 minutes whatever happens to the account; that bound only holds
   * if nothing mints fresh tokens for a principal who lost standing (`changePassword`/`setPassword`
   * would otherwise renew a disabled user indefinitely). Raises the same exceptions as password
   * login.
   */
  private async assertGoodStanding(status: UserStatus, tenant: TenantRow | null): Promise<void> {
    if (status === UserStatus.DISABLED) {
      throw new AccountDisabledException();
    }

    if (isTenantLoginBlocked(tenant)) {
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
   * `tenant` is optional so callers that already loaded the row for a suspension check can pass it
   * instead of paying for a second query.
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
    // `tenant` is only null if the row vanished mid-request; an empty string is a display gap, not
    // a reason to fail token issuance.
    userDto.businessName = tenant?.name ?? '';
    return userDto;
  }

  private otpExpiresAt(): Date {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  /**
   * The issuing transaction already committed, so a refused job does not undo it; the caller learns whether the mail was queued
   * (`false`: the queue manager already logged why) and decides what a person should see. Never throws.
   */
  private async sendOtpEmail(input: SendOtpEmailInput): Promise<boolean> {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    const job: IOtpEmailJob = {
      email: input.email,
      customerName: input.customerName,
      otp: input.rawOtp,
      expiresIn: `${ttlMinutes} minutes`,
    };
    try {
      await this.queueManager.addRegisterationOtpEmailJob(JobName.OTP_EMAIL_VERIFICATION, job);
      return true;
    } catch {
      return false;
    }
  }
}
