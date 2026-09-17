import { JobName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import type { Locale } from '@common/i18n/locale';
import { isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { AuthDbService, type TenantRow } from '@db/repositories/auth/auth.db-service';
import type { PlatformAdminByEmail } from '@db/repositories/auth/auth.repository';
import { DemoDataDbService } from '@db/repositories/demo-data/demo-data.db-service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import { GoogleOAuthStateService } from './google-oauth-state.service';
import { LoginAttemptService } from './login-attempt.service';
import { OtpAttemptService } from './otp-attempt.service';
import { PendingGoogleSignupService } from './pending-google-signup.service';
import { TokenService } from './token.service';

import { GOOGLE_AUTH_REDIRECT, GoogleAuthFailure } from '../constants/google-auth.constants';
import { AuthenticatedUserDto } from '../dto/authenticated-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginPendingVerificationDto } from '../dto/login-response.dto';
import { LoginDto } from '../dto/login.dto';
import { PlatformAdminSummaryDto } from '../dto/platform-admin-summary.dto';
import { PlatformAdminTokenResponseDto } from '../dto/platform-admin-token-response.dto';
import { ResendOtpDto } from '../dto/resend-otp.dto';
import { SetPasswordDto } from '../dto/set-password.dto';
import { SignupResponseDto } from '../dto/signup-response.dto';
import { SignupDto } from '../dto/signup.dto';
import { TokenResponseDto } from '../dto/token-response.dto';
import { UpdateLocaleResponseDto } from '../dto/update-locale-response.dto';
import { UpdateLocaleDto } from '../dto/update-locale.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import { PlatformAdminStatus } from '../enums/platform-admin-status.enum';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { GoogleIdentityProvider } from '../providers/google-identity.provider';
import { VerifyEmailTokenProvider } from '../providers/verify-email-token.provider';
import type { AuthUser } from '../types/auth-user.type';
import { normalizeEmail } from '../utils/email.utils';
import { hashToken } from '../utils/token.utils';

export interface GoogleAuthorizeInput {
  intent: OAuthIntent;
}

/** `AuthController.googleAuthorize` redirects either way — this carries the already-computed target, computed here rather than in the controller. */
export type GoogleAuthorizeRedirect =
  { ok: false; redirectUrl: string } | { ok: true; authorizationUrl: string; sid: string };

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
  /** A genuinely new person — the caller sets `pendingSignupCookie` and redirects to collect a business name. */
  | { ok: true; kind: 'needs_business_name'; pendingSignupCookie: string }
  | { ok: true; kind: 'signed_in'; tokens: TokenIssuanceResult };

export interface TokenIssuanceResult {
  body: TokenResponseDto;
  refreshToken: string;
}

/**
 * Login's platform-admin branch. Structurally distinct from both `TokenIssuanceResult` (no
 * `refreshToken` field — see `TokenService.signPlatformAdminAccessToken`) and
 * `LoginPendingVerificationDto` (no `body`/`admin` field), so `AuthController.login` can tell all
 * three apart with a plain `in` check, the same way it already does for the other two.
 */
export interface PlatformAdminLoginResult {
  admin: true;
  body: PlatformAdminTokenResponseDto;
}

interface PlatformAdminLoginInput {
  email: string;
  password: string;
  admin: PlatformAdminByEmail;
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
    private readonly demoDataDbService: DemoDataDbService
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
   * Refuses a tenant signup for an email that already belongs to a *loggable-in* platform admin.
   * The mirror of the guard `AdminSettingsService.sendInvite` applies in the other direction —
   * together they keep the two identity tables disjoint for any admin who can actually
   * authenticate, which matters because `login` has to resolve an email to exactly one of them.
   *
   * Deliberately keyed on `passwordHash` being set, not merely a row existing: an `invited` admin
   * (no password yet — see `PlatformAdminByEmail`'s own comment) has no accept-invite flow to ever
   * turn that row into a real, loggable-in identity (`AdminSettingsService.sendInvite`'s own
   * comment notes this is still unbuilt). Rejecting signup for that email anyway made an invited
   * address a dead end with no way in at all: it could not accept the invite, could not sign up as
   * a tenant (this guard), and could not log in either (`login` falls through a null-hash admin
   * row to the tenant path, which then has no user to find). Scoping this to a real password
   * preserves the actual invariant this guard protects — no email resolves to two authenticatable
   * identities — without also blocking the one path that email has left.
   *
   * Deliberately the same generic `EMAIL_ALREADY_REGISTERED` a duplicate tenant email gets: a
   * distinct "that address belongs to a platform admin" would turn public signup into an oracle
   * for enumerating admin addresses, which is the last set of addresses worth leaking.
   */
  private async assertEmailNotAPlatformAdmin(email: string): Promise<void> {
    const admin = await this.authDbService.findPlatformAdminForLogin(email);
    if (admin?.passwordHash) {
      throw new ConflictException(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
    }
  }

  async signup(dto: SignupDto): Promise<SignupResponseDto> {
    const email = normalizeEmail(dto.email);

    await this.assertEmailNotAPlatformAdmin(email);

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
      throw new BadRequestException(MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP);
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
   * One shared endpoint for every principal type — the frontend has a single sign-in screen with
   * no "I'm an admin" toggle, so this has to resolve which identity space an email belongs to
   * itself rather than being told in advance. `platform_admins` is checked first and, if it
   * matches, owns the request exclusively: nothing stops the same email also existing as a tenant
   * user (`signup` never checks the admin table), and a self-service tenant signup must never be
   * able to shadow a deliberately-provisioned admin identity — so a colliding tenant account for
   * that email is simply never consulted, not merely deprioritized.
   */
  async login(
    dto: LoginDto
  ): Promise<LoginPendingVerificationDto | PlatformAdminLoginResult | TokenIssuanceResult> {
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

    // `platform_admins` is resolved first, but only for a row that could actually authenticate.
    // A NULL `password_hash` means an invite nobody has accepted (nothing sets one until they do —
    // see `AdminSettingsService.sendInvite`), and such a row can never succeed here: the branch
    // below always rejects it. Letting it claim the email anyway meant an invited address was
    // permanently shadowed — sign up as a tenant, verify by OTP, get a live account, and then
    // every login 401s forever against an admin row that cannot log in either. Falling through
    // leaves that person their real tenant account, and costs the admin side nothing.
    //
    // Timing parity is preserved: whichever branch runs pays for exactly one bcrypt compare, the
    // tenant one against the decoy when no user matches.
    const admin = await this.authDbService.findPlatformAdminForLogin(email);
    if (admin?.passwordHash) {
      return this.platformAdminLogin({ email, password: dto.password, admin });
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
   * `password_hash IS NULL`), so there is no current password to prove. `changePassword` proves
   * intent with the current password; this proves it with a fresh OTP from
   * `requestSetPasswordOtp` instead, since without *some* second factor an access token alone
   * (stolen or otherwise) would be enough to turn a 15-minute credential into a permanent one —
   * see `requestSetPasswordOtp`'s doc comment. Settings' "Add password" flow calls this once the
   * OTP step completes; from then on that account uses `changePassword`.
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
      throw new BadRequestException(MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP);
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
    if (actor.type !== JwtTokenType.TENANT_USER) {
      throw new ForbiddenException(MESSAGES.AUTH.TENANT_ONLY);
    }

    const user = await this.authDbService.findUserById(actor.id);
    if (!user) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_ACCESS_TOKEN);
    }

    const tenant = await this.authDbService.findTenantStatus(user.tenantId);
    await this.assertGoodStanding(user.status, tenant);

    await this.authDbService.updateLocale({ userId: user.id, locale: dto.locale });

    const updatedUser = { ...user, locale: dto.locale };
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

    if (input.error !== undefined) {
      return this.googleFailureRedirect(GoogleAuthFailure.ACCESS_DENIED, intent);
    }

    if (!consumed.ok) {
      return this.googleFailureRedirect(GoogleAuthFailure.INVALID_STATE);
    }

    if (input.code === undefined || input.code === '') {
      return this.googleFailureRedirect(GoogleAuthFailure.PROVIDER_ERROR, consumed.record.intent);
    }

    let identity;
    try {
      identity = await this.googleIdentityProvider.fetchIdentity(input.code);
    } catch (error) {
      this.logger.warn(`Google identity exchange failed: ${(error as Error).message}`);
      return this.googleFailureRedirect(GoogleAuthFailure.PROVIDER_ERROR, consumed.record.intent);
    }

    // Refused rather than trusted: an unverified address would let someone claim an account by
    // registering a Google profile against an email they do not control.
    if (!identity.emailVerified) {
      return this.googleFailureRedirect(
        GoogleAuthFailure.EMAIL_NOT_VERIFIED,
        consumed.record.intent
      );
    }

    const email = normalizeEmail(identity.email);
    const lookup = await this.authDbService.resolveGoogleIdentity({
      providerUserId: identity.providerUserId,
      email,
    });

    if (lookup.kind === 'unknown') {
      if (consumed.record.intent === OAuthIntent.LOGIN) {
        // Login can never create a tenant it has no name for.
        return this.googleFailureRedirect(GoogleAuthFailure.NO_ACCOUNT, consumed.record.intent);
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
   * Builds the `?error=` redirect target for a callback failure — moved here (out of
   * `AuthController.googleCallback`) so the controller's job stays "read `ok`, act," with no
   * `intent`-to-URL mapping of its own. Defaults to the login page: everywhere this is called
   * without a known `intent`, the state was never validly consumed, so there is no way to know
   * the original screen and the login page is the safer fallback (it never invents a tenant).
   */
  private googleFailureRedirect(
    failure: GoogleAuthFailure,
    intent?: OAuthIntent
  ): GoogleCallbackOutcome {
    const base =
      intent === OAuthIntent.SIGNUP ? GOOGLE_AUTH_REDIRECT.SIGNUP : GOOGLE_AUTH_REDIRECT.LOGIN;
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
      throw new BadRequestException(MESSAGES.AUTH.GOOGLE_PENDING_SIGNUP_EXPIRED);
    }

    await this.assertEmailNotAPlatformAdmin(normalizeEmail(pending.identity.email));

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

    // Unconditional here (unlike the other two hooks) — `completeGoogleSignup` only ever reaches
    // this point by inserting a brand-new tenant, never by promoting an existing row.
    this.seedDemoDataIfDev({ userId: user.id, tenantId: user.tenantId });

    return this.buildTokenIssuanceResult(user);
  }

  /**
   * The platform-admin branch of `login`, split out for readability. Same timing discipline as
   * the tenant branch below it: the bcrypt compare always runs, so a wrong password resolves in
   * the same amount of time and with the same generic message as any other failure.
   *
   * Only reached for an admin that has a `password_hash` — the caller routes a NULL-hash row (an
   * unaccepted invite) to the tenant path instead, for the reason documented there. The
   * `!admin.passwordHash` arm below is therefore defensive, kept so this stays correct on its own
   * terms if it is ever called from somewhere else, and the decoy keeps that arm constant-time.
   */
  private async platformAdminLogin(
    input: PlatformAdminLoginInput
  ): Promise<PlatformAdminLoginResult> {
    const { email, password, admin } = input;
    const passwordMatches = await this.hashingService.compare(
      password,
      admin.passwordHash ?? (await this.decoyPasswordHash())
    );

    if (!admin.passwordHash || !passwordMatches) {
      await this.loginAttemptService.recordFailure(email);
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    await this.loginAttemptService.reset(email);

    // `invited` (no password yet) already failed the check above; only `disabled` reaches here.
    if (admin.status === PlatformAdminStatus.DISABLED) {
      throw new ForbiddenException(MESSAGES.AUTH.ACCOUNT_DISABLED);
    }

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
