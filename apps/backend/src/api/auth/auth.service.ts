import { JobName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import type { Locale } from '@common/i18n/locale';
import { EnvConfig } from '@config/env.config';
import { AuthDbService, type TenantRow } from '@db/repositories/auth/auth.db-service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import { GoogleAuthFailure } from './constants/google-auth.constants';
import { AuthenticatedUserDto } from './dto/authenticated-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginPendingVerificationDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SignupResponseDto } from './dto/signup-response.dto';
import { SignupDto } from './dto/signup.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UpdateLocaleResponseDto } from './dto/update-locale-response.dto';
import { UpdateLocaleDto } from './dto/update-locale.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtTokenType } from './enums/jwt-token-type.enum';
import { OAuthIntent } from './enums/oauth-intent.enum';
import { TenantStatus } from './enums/tenant-status.enum';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { LoginAttemptService } from './login-attempt.service';
import { OtpAttemptService } from './otp-attempt.service';
import { GoogleIdentityProvider } from './providers/google-identity.provider';
import { VerifyEmailTokenProvider } from './providers/verify-email-token.provider';
import { GoogleOAuthStateService } from './services/google-oauth-state.service';
import { PendingGoogleSignupService } from './services/pending-google-signup.service';
import { TokenService } from './token.service';
import type { AuthUser } from './types/auth-user.type';
import { normalizeEmail } from './utils/email.utils';
import { hashToken } from './utils/token.utils';

/**
 * What a successful verify-email/login/refresh actually produces: the JSON body (no refresh
 * token in it) plus the raw refresh token separately, so `AuthController` can set it as an
 * httpOnly cookie instead of serializing it into the response — a script on the page should
 * never be able to read it.
 */
export type GoogleCallbackOutcome =
  | { ok: false; failure: GoogleAuthFailure; intent?: OAuthIntent }
  /** A genuinely new person — the caller sets `pendingSignupCookie` and redirects to collect a business name. */
  | { ok: true; kind: 'needs_business_name'; pendingSignupCookie: string }
  | { ok: true; kind: 'signed_in'; tokens: TokenIssuanceResult };

export interface TokenIssuanceResult {
  body: TokenResponseDto;
  refreshToken: string;
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
    private readonly pendingGoogleSignupService: PendingGoogleSignupService
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
      throw new ConflictException(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
    }

    this.sendOtpEmail(email, result.ownerName, rawOtp);

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

    const user = await this.authDbService.verifyEmail(email, hashToken(dto.otp));

    if (!user) {
      throw new BadRequestException(MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP);
    }

    await this.otpAttemptService.reset(email);

    return this.buildTokenIssuanceResult(user);
  }

  /**
   * Order matters: credentials are checked *before* branching on status, so `pending_verification`
   * is only revealed to someone who already proved they know the password — not to anyone who
   * merely knows the email exists.
   */
  async login(dto: LoginDto): Promise<LoginPendingVerificationDto | TokenIssuanceResult> {
    const email = normalizeEmail(dto.email);

    // Per-account ceiling, checked before any DB work. The per-IP throttle on this route does not
    // cover credential stuffing, which arrives from many addresses a few attempts each, all aimed
    // at one account. A locked address still pays for one decoy comparison and still gets the
    // identical INVALID_CREDENTIALS — skipping the bcrypt cost would make the faster response the
    // tell, and a distinct "locked" code would confirm both that the account exists and that the
    // threshold was found.
    if (await this.loginAttemptService.isLockedOut(email)) {
      await this.hashingService.compare(dto.password, await this.decoyPasswordHash());
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);
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
      await this.loginAttemptService.recordFailure(email);
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    // The password is proven from here on, so the failure budget has served its purpose. Cleared
    // before the status branches below: a `pending_verification` or suspended account that typed
    // the right password should not keep burning attempts it already passed.
    await this.loginAttemptService.reset(email);

    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenException(MESSAGES.AUTH.ACCOUNT_DISABLED);
    }

    const tenant = await this.authDbService.findTenantStatus(user.tenantId);
    if (tenant?.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException(MESSAGES.AUTH.TENANT_SUSPENDED);
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      await this.issueOtp(user.id, email, user.name);

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
      await this.issueOtp(user.id, email, user.name);
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
    if (actor.type !== JwtTokenType.TENANT_USER) {
      throw new ForbiddenException(MESSAGES.AUTH.TENANT_ONLY);
    }

    const user = await this.authDbService.findUserById(actor.id);
    if (!user) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
    }

    if (!user.passwordHash) {
      throw new BadRequestException(MESSAGES.AUTH.NO_PASSWORD_SET);
    }

    const currentMatches = await this.hashingService.compare(
      dto.currentPassword,
      user.passwordHash
    );
    if (!currentMatches) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CURRENT_PASSWORD);
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.authDbService.updatePasswordAndRevokeSessions(user.id, newPasswordHash);

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
    if (actor.type !== JwtTokenType.TENANT_USER) {
      throw new ForbiddenException(MESSAGES.AUTH.TENANT_ONLY);
    }

    const user = await this.authDbService.findUserById(actor.id);
    if (!user) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
    }

    const tenant = await this.authDbService.findTenantStatus(user.tenantId);
    return this.toAuthenticatedUserDto(user, tenant);
  }

  /**
   * The other half of `changePassword` — for an account that has never had one (Google/SSO-only,
   * `password_hash IS NULL`), so there is no current password to prove. Settings' "Add password"
   * flow calls this instead; once it succeeds, that same account uses `changePassword` from then on.
   */
  async setPassword(actor: AuthUser, dto: SetPasswordDto): Promise<TokenIssuanceResult> {
    if (actor.type !== JwtTokenType.TENANT_USER) {
      throw new ForbiddenException(MESSAGES.AUTH.TENANT_ONLY);
    }

    const user = await this.authDbService.findUserById(actor.id);
    if (!user) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
    }

    if (user.passwordHash) {
      throw new BadRequestException(MESSAGES.AUTH.PASSWORD_ALREADY_SET);
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.authDbService.updatePasswordAndRevokeSessions(user.id, newPasswordHash);

    return this.buildTokenIssuanceResult({ ...user, passwordHash: newPasswordHash });
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
    if (actor.type !== JwtTokenType.TENANT_USER) {
      throw new ForbiddenException(MESSAGES.AUTH.TENANT_ONLY);
    }

    const user = await this.authDbService.findUserById(actor.id);
    if (!user) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
    }

    await this.authDbService.updateLocale(user.id, dto.locale);

    const updatedUser = { ...user, locale: dto.locale };
    const tenant = await this.authDbService.findTenantStatus(updatedUser.tenantId);
    const { accessToken, expiresIn } = this.tokenService.reissueAccessToken(updatedUser);

    const response = new UpdateLocaleResponseDto();
    response.accessToken = accessToken;
    response.expiresIn = expiresIn;
    response.user = this.toAuthenticatedUserDto(updatedUser, tenant);
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
  private async issueOtp(userId: string, email: string, name: string): Promise<void> {
    if (!(await this.otpAttemptService.claimResend(email))) {
      return;
    }

    const rawOtp = this.verifyEmailTokenProvider.generate();
    await this.authDbService.putVerifyEmailToken(
      userId,
      hashToken(rawOtp),
      this.otpExpiresAt().toISOString()
    );
    this.sendOtpEmail(email, name, rawOtp);
  }

  /**
   * Step one of Google sign-in: mint the state and hand back where to send the browser.
   *
   * No business name here any more — see `completeGoogleSignup`. Both intents mint the same
   * state now; the only thing that ever varied per intent was `businessName`.
   */
  async buildGoogleAuthorizeRedirect(input: {
    intent: OAuthIntent;
  }): Promise<{ authorizationUrl: string; sid: string }> {
    if (!this.googleIdentityProvider.isConfigured()) {
      throw new ServiceUnavailableException(MESSAGES.AUTH.GOOGLE_NOT_CONFIGURED);
    }

    const { state, sid } = await this.googleOAuthStateService.mint({ intent: input.intent });

    return { authorizationUrl: this.googleIdentityProvider.buildAuthorizationUrl(state), sid };
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

    if (input.error !== undefined) {
      return { ok: false, failure: GoogleAuthFailure.ACCESS_DENIED, ...(intent ? { intent } : {}) };
    }

    if (!consumed.ok) {
      return { ok: false, failure: GoogleAuthFailure.INVALID_STATE };
    }

    if (input.code === undefined || input.code === '') {
      return {
        ok: false,
        failure: GoogleAuthFailure.PROVIDER_ERROR,
        intent: consumed.record.intent,
      };
    }

    let identity;
    try {
      identity = await this.googleIdentityProvider.fetchIdentity(input.code);
    } catch (error) {
      this.logger.warn(`Google identity exchange failed: ${(error as Error).message}`);
      return {
        ok: false,
        failure: GoogleAuthFailure.PROVIDER_ERROR,
        intent: consumed.record.intent,
      };
    }

    // Refused rather than trusted: an unverified address would let someone claim an account by
    // registering a Google profile against an email they do not control.
    if (!identity.emailVerified) {
      return {
        ok: false,
        failure: GoogleAuthFailure.EMAIL_NOT_VERIFIED,
        intent: consumed.record.intent,
      };
    }

    const email = normalizeEmail(identity.email);
    const lookup = await this.authDbService.resolveGoogleIdentity({
      providerUserId: identity.providerUserId,
      email,
    });

    if (lookup.kind === 'unknown') {
      if (consumed.record.intent === OAuthIntent.LOGIN) {
        // Login can never create a tenant it has no name for.
        return { ok: false, failure: GoogleAuthFailure.NO_ACCOUNT, intent: consumed.record.intent };
      }

      const pendingSignupCookie = await this.pendingGoogleSignupService.mint({
        providerUserId: identity.providerUserId,
        email,
        name: identity.name,
      });
      return { ok: true, kind: 'needs_business_name', pendingSignupCookie };
    }

    // The same standing check password login applies (`login`, above) and refresh re-applies
    // (`TokenService.rotate`). Without it a disabled account could still sign in through the
    // Google button — the one entry point that never looked at `users.status`.
    if (lookup.user.status === UserStatus.DISABLED) {
      return {
        ok: false,
        failure: GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
        intent: consumed.record.intent,
      };
    }

    const tenant = await this.authDbService.findTenantStatus(lookup.user.tenantId);
    if (tenant?.status === TenantStatus.SUSPENDED) {
      return {
        ok: false,
        failure: GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
        intent: consumed.record.intent,
      };
    }

    const tokens = await this.buildTokenIssuanceResult(lookup.user, tenant);
    return { ok: true, kind: 'signed_in', tokens };
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
      throw new BadRequestException(MESSAGES.AUTH.GOOGLE_PENDING_SIGNUP_EXPIRED);
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
      throw new ConflictException(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
    }

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
      throw new ForbiddenException(MESSAGES.AUTH.ACCOUNT_DISABLED);
    }

    if (tenant?.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException(MESSAGES.AUTH.TENANT_SUSPENDED);
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
    const [hasConnectedBusiness, tenant] = await Promise.all([
      this.authDbService.hasConnectedBusiness(user.tenantId),
      prefetchedTenant === undefined
        ? this.authDbService.findTenantStatus(user.tenantId)
        : Promise.resolve(prefetchedTenant),
    ]);

    const userDto = this.toAuthenticatedUserDto(user, tenant);

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
    tenant: TenantRow | null
  ): AuthenticatedUserDto {
    const userDto = new AuthenticatedUserDto();
    userDto.id = user.id;
    userDto.tenantId = user.tenantId;
    userDto.name = user.name;
    userDto.email = user.email;
    userDto.role = user.role;
    userDto.hasPassword = user.passwordHash !== null;
    userDto.locale = user.locale;
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
  private sendOtpEmail(email: string, customerName: string, rawOtp: string): void {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    const job: IOtpEmailJob = {
      email,
      customerName,
      otp: rawOtp,
      expiresIn: `${ttlMinutes} minutes`,
    };
    void this.queueManager
      .addRegisterationOtpEmailJob(JobName.OTP_EMAIL_VERIFICATION, job)
      .catch(() => undefined);
  }
}
