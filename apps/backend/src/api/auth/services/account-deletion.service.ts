import { JobName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { HashingService } from '@common/hashing/hashing.service';
import { EnvConfig } from '@config/env.config';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { UserByEmail } from '@db/repositories/auth/types/auth.type';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import { ErasureNoticeService } from './erasure-notice.service';
import { LoginAttemptScope, LoginAttemptService } from './login-attempt.service';
import { OtpAttemptService } from './otp-attempt.service';

import { DeleteAccountResponseDto } from '../dto/delete-account-response.dto';
import { DeleteAccountDto } from '../dto/delete-account.dto';
import { RestoreAccountDto } from '../dto/restore-account.dto';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import {
  AccountDeletionNotPossibleException,
  AccountDisabledException,
  BusinessNameMismatchException,
  InvalidAccessTokenException,
  InvalidCredentialsException,
  InvalidCurrentPasswordException,
  InvalidOtpException,
  PasswordRequiredToDeleteException,
} from '../exceptions/auth.exceptions';
import { VerifyEmailTokenProvider } from '../providers/verify-email-token.provider';
import type { AuthUser } from '../types/auth.type';
import { normalizeEmail } from '../utils/email.utils';
import { requireTenantUser } from '../utils/require-tenant-user.util';
import { hashToken } from '../utils/token.utils';

/** Deliberately not the owner's email: the activity log is never anonymized, so it would outlive the erasure. */
export const SELF_SERVICE_ACTOR_LABEL = 'owner (self-service)';

export type DeleteAccountResult = DeleteAccountResponseDto;

/**
 * Same effects as a platform-admin erasure request, plus `tenants.erasure_requested_by_user_id`,
 * which is the only thing letting restore tell "I asked for this" from "an admin did".
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  private decoyHash?: Promise<string>;

  constructor(
    private readonly authDbService: AuthDbService,
    private readonly hashingService: HashingService,
    private readonly verifyEmailTokenProvider: VerifyEmailTokenProvider,
    private readonly otpAttemptService: OtpAttemptService,
    private readonly loginAttemptService: LoginAttemptService,
    private readonly queueManager: AddingJobsToQueueManager,
    private readonly configService: ConfigService<EnvConfig>,
    private readonly billingReconciliationService: BillingReconciliationService,
    private readonly adminOverviewDbService: AdminOverviewDbService,
    private readonly erasureNoticeService: ErasureNoticeService
  ) {}

  /** Mails the step-up code to an owner without a password; one with a password confirms with it. */
  async requestOtp(actor: AuthUser): Promise<{ message: string }> {
    const user = await this.requireOwner(actor);
    if (user.passwordHash) {
      throw new PasswordRequiredToDeleteException();
    }

    if (await this.otpAttemptService.claimResend(user.email)) {
      const rawOtp = this.verifyEmailTokenProvider.generate();
      await this.authDbService.putDeleteAccountOtp({
        userId: user.id,
        tokenHash: hashToken(rawOtp),
        expiresAt: this.otpExpiresAt().toISOString(),
      });
      this.sendOtpEmail(user, rawOtp);
    }

    return { message: MESSAGES.AUTH.DELETE_ACCOUNT_OTP_ACK };
  }

  async deleteAccount(actor: AuthUser, dto: DeleteAccountDto): Promise<DeleteAccountResult> {
    const user = await this.requireOwner(actor);

    const tenant = await this.authDbService.findTenantErasureState(user.tenantId);
    if (
      !tenant ||
      (tenant.status !== TenantStatus.ACTIVE && tenant.status !== TenantStatus.PENDING_ACTIVATION)
    ) {
      throw new AccountDeletionNotPossibleException();
    }

    // Before the credential check, so a typo costs neither a password attempt nor an OTP.
    if (dto.businessName.trim() !== tenant.name.trim()) {
      throw new BusinessNameMismatchException();
    }

    await this.reauthenticate(user, dto);

    const scheduled = await this.authDbService.requestTenantErasureBySelf({
      tenantId: user.tenantId,
      requestedByUserId: user.id,
    });
    if (!scheduled) {
      throw new AccountDeletionNotPossibleException();
    }

    // Best-effort, as for an admin's request: the erasure has taken effect, and the purge deletes
    // the Stripe customer outright anyway.
    try {
      await this.billingReconciliationService.scheduleCancellationForErasure(user.tenantId);
    } catch (error) {
      this.logger.warn(
        `Could not schedule subscription cancellation for tenant ${user.tenantId} on self-service erasure: ${(error as Error).message}`
      );
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.BUSINESS_ERASURE_REQUESTED,
      actorPlatformAdminId: null,
      actorEmail: SELF_SERVICE_ACTOR_LABEL,
      tenantId: user.tenantId,
      businessName: scheduled.name,
    });

    await this.erasureNoticeService.notifyScheduled({
      tenantId: user.tenantId,
      businessName: scheduled.name,
      requestedBy: 'owner',
      requesterUserId: user.id,
    });

    // Best-effort: the erasure is already committed, and failing here would answer 500 without
    // clearing the cookies, hiding that it was scheduled. A surviving refresh token is refused
    // anyway while the tenant is suspended.
    try {
      await this.authDbService.revokeAllRefreshTokensForUser(user.id);
    } catch (error) {
      this.logger.warn(
        `Could not revoke refresh tokens for user ${user.id}: ${(error as Error).message}`
      );
    }

    const gracePeriodDays = getErasureGracePeriodDays(this.configService);
    const response = new DeleteAccountResponseDto();
    response.scheduledFor = new Date(Date.now() + gracePeriodDays * 86_400_000).toISOString();
    response.gracePeriodDays = gracePeriodDays;
    response.canRestore = user.passwordHash !== null;
    return response;
  }

  /**
   * Public route. Every way of not qualifying (unknown email, wrong password, an admin's erasure,
   * a non-owner) is the same `INVALID_CREDENTIALS`, so it cannot reveal who has a pending erasure.
   */
  async restoreAccount(dto: RestoreAccountDto): Promise<{ message: string }> {
    const email = normalizeEmail(dto.email);

    if (await this.loginAttemptService.isLockedOut(email, LoginAttemptScope.TENANT)) {
      await this.hashingService.compare(dto.password, await this.decoyPasswordHash());
      throw new InvalidCredentialsException();
    }

    const user = await this.authDbService.findUserForLogin(email);
    const passwordMatches = await this.hashingService.compare(
      dto.password,
      user?.passwordHash ?? (await this.decoyPasswordHash())
    );
    if (!user?.passwordHash || !passwordMatches) {
      await this.loginAttemptService.recordFailure(email, LoginAttemptScope.TENANT);
      throw new InvalidCredentialsException();
    }
    await this.loginAttemptService.reset(email, LoginAttemptScope.TENANT);

    if (user.role !== UserRole.OWNER || user.status === UserStatus.DISABLED) {
      throw new InvalidCredentialsException();
    }

    const restored = await this.authDbService.cancelSelfRequestedErasure({
      tenantId: user.tenantId,
      requestedByUserId: user.id,
      gracePeriodDays: getErasureGracePeriodDays(this.configService),
    });
    if (!restored) {
      throw new InvalidCredentialsException();
    }

    try {
      await this.billingReconciliationService.resumeAfterErasureCancelled(user.tenantId);
    } catch (error) {
      this.logger.warn(
        `Could not resume subscription for tenant ${user.tenantId} after self-service restore: ${(error as Error).message}`
      );
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.BUSINESS_ERASURE_CANCELLED,
      actorPlatformAdminId: null,
      actorEmail: SELF_SERVICE_ACTOR_LABEL,
      tenantId: user.tenantId,
      businessName: restored.name,
    });

    await this.erasureNoticeService.notifyCancelled({
      tenantId: user.tenantId,
      businessName: restored.name,
    });

    return { message: MESSAGES.AUTH.ACCOUNT_RESTORED };
  }

  private async requireOwner(actor: AuthUser): Promise<UserByEmail> {
    const tenantUser = requireTenantUser(actor, MESSAGES.AUTH.TENANT_ONLY);
    const user = await this.authDbService.findUserById(tenantUser.id);
    if (!user) {
      throw new InvalidAccessTokenException();
    }
    // Access tokens are stateless, so a disabled owner's token outlives the disabling; it must not
    // be enough to schedule the whole business for deletion.
    if (user.status === UserStatus.DISABLED) {
      throw new AccountDisabledException();
    }
    if (user.role !== UserRole.OWNER) {
      throw new AccountDeletionNotPossibleException();
    }
    return user;
  }

  private async reauthenticate(user: UserByEmail, dto: DeleteAccountDto): Promise<void> {
    if (user.passwordHash) {
      if (!dto.password) {
        throw new PasswordRequiredToDeleteException();
      }

      if (await this.loginAttemptService.isLockedOut(user.email, LoginAttemptScope.TENANT)) {
        await this.hashingService.compare(dto.password, await this.decoyPasswordHash());
        throw new InvalidCurrentPasswordException();
      }

      if (!(await this.hashingService.compare(dto.password, user.passwordHash))) {
        await this.loginAttemptService.recordFailure(user.email, LoginAttemptScope.TENANT);
        throw new InvalidCurrentPasswordException();
      }
      await this.loginAttemptService.reset(user.email, LoginAttemptScope.TENANT);
      return;
    }

    if (!dto.otp) {
      throw new InvalidOtpException();
    }
    if (!(await this.otpAttemptService.consumeAttempt(user.email))) {
      throw new HttpException(MESSAGES.AUTH.TOO_MANY_OTP_ATTEMPTS, HttpStatus.TOO_MANY_REQUESTS);
    }
    const otpValid = await this.authDbService.consumeDeleteAccountOtp({
      userId: user.id,
      tokenHash: hashToken(dto.otp),
    });
    if (!otpValid) {
      throw new InvalidOtpException();
    }
    await this.otpAttemptService.reset(user.email);
  }

  private decoyPasswordHash(): Promise<string> {
    this.decoyHash ??= this.hashingService.hash(randomBytes(32).toString('hex'));
    return this.decoyHash;
  }

  private otpExpiresAt(): Date {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  /** Fire-and-forget like every other OTP mail — the resend click is the recovery path. */
  private sendOtpEmail(user: UserByEmail, rawOtp: string): void {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    const job: IOtpEmailJob = {
      email: user.email,
      customerName: user.name,
      otp: rawOtp,
      expiresIn: `${ttlMinutes} minutes`,
    };
    void this.queueManager
      .addRegisterationOtpEmailJob(JobName.OTP_EMAIL_VERIFICATION, job)
      .catch(() => undefined);
  }
}
