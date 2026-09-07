import { JobName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import { EnvConfig } from '@config/env.config';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import { AuthenticatedUserDto } from './dto/authenticated-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginPendingVerificationDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SignupResponseDto } from './dto/signup-response.dto';
import { SignupDto } from './dto/signup.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtTokenType } from './enums/jwt-token-type.enum';
import { TenantStatus } from './enums/tenant-status.enum';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { OtpAttemptService } from './otp-attempt.service';
import { VerifyEmailTokenProvider } from './providers/verify-email-token.provider';
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
export interface TokenIssuanceResult {
  body: TokenResponseDto;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly authDbService: AuthDbService,
    private readonly hashingService: HashingService,
    private readonly verifyEmailTokenProvider: VerifyEmailTokenProvider,
    private readonly tokenService: TokenService,
    private readonly otpAttemptService: OtpAttemptService,
    private readonly queueManager: AddingJobsToQueueManager,
    private readonly configService: ConfigService<EnvConfig>
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
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

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

    return this.buildTokenIssuanceResult(user);
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
    const { tokens, user } = await this.tokenService.rotate(rawRefreshToken);
    return this.toTokenIssuanceResult(tokens, user);
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

    return this.buildTokenIssuanceResult(user);
  }

  private async issueOtp(userId: string, email: string, name: string): Promise<void> {
    const rawOtp = this.verifyEmailTokenProvider.generate();
    await this.authDbService.putVerifyEmailToken(
      userId,
      hashToken(rawOtp),
      this.otpExpiresAt().toISOString()
    );
    this.sendOtpEmail(email, name, rawOtp);
  }

  private async buildTokenIssuanceResult(user: {
    id: string;
    tenantId: string;
    email: string;
    name: string;
    role: UserRole;
  }): Promise<TokenIssuanceResult> {
    const tokens = await this.tokenService.issueTokenPair(user);
    return this.toTokenIssuanceResult(tokens, user);
  }

  private async toTokenIssuanceResult(
    tokens: { accessToken: string; refreshToken: string; expiresIn: number },
    user: { id: string; tenantId: string; email: string; name: string; role: UserRole }
  ): Promise<TokenIssuanceResult> {
    const hasConnectedBusiness = await this.authDbService.hasConnectedBusiness(user.tenantId);

    const userDto = new AuthenticatedUserDto();
    userDto.id = user.id;
    userDto.tenantId = user.tenantId;
    userDto.name = user.name;
    userDto.email = user.email;
    userDto.role = user.role;

    const body = new TokenResponseDto();
    body.accessToken = tokens.accessToken;
    body.expiresIn = tokens.expiresIn;
    body.user = userDto;
    body.hasConnectedBusiness = hasConnectedBusiness;

    return { body, refreshToken: tokens.refreshToken };
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
