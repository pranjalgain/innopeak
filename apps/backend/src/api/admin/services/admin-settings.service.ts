import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import {
  InvalidCurrentPasswordException,
  InvalidOtpException,
  NewPasswordSameAsCurrentException,
  NoPasswordSetException,
  PasswordAlreadySetException,
} from '@auth/exceptions/auth.exceptions';
import { VerifyEmailTokenProvider } from '@auth/providers/verify-email-token.provider';
import { OtpAttemptService } from '@auth/services/otp-attempt.service';
import { TokenService } from '@auth/services/token.service';
import { buildAdminInviteLink } from '@auth/utils/admin-invite-link.util';
import { remainingSessionSeconds } from '@auth/utils/remaining-session-seconds.util';
import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { hashAdminSetPasswordOtp, hashToken } from '@auth/utils/token.utils';
import { JobName } from '@bg/constants/job.constant';
import type { IAdminInviteEmailJob, IOtpEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { HashingService } from '@common/hashing/hashing.service';
import { isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { isCheckViolation, isUniqueViolation } from '@db/helpers/pg-error.util';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import type { PlatformSettingsPatch } from '@db/repositories/platform-settings/types/platform-settings.type';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import type { UpdateLocaleDto } from '../../auth/dto/update-locale.dto';
import type { AuthUser } from '../../auth/types/auth.type';
import { PlatformSettingsResponseDto } from '../../settings/dto/platform-settings-response.dto';
import { AdminInviteResponseDto } from '../dto/admin-invite-response.dto';
import { AdminProfileResponseDto } from '../dto/admin-profile-response.dto';
import { ChangeAdminPasswordDto } from '../dto/change-admin-password.dto';
import { SendAdminInviteDto } from '../dto/send-admin-invite.dto';
import { SetAdminPasswordDto } from '../dto/set-admin-password.dto';
import { UpdateAdminLocaleResponseDto } from '../dto/update-admin-locale-response.dto';
import { UpdatePlatformSettingsDto } from '../dto/update-platform-settings.dto';
import {
  AdminEmailAlreadyInvitedException,
  AdminInviteNotFoundException,
  AdminInviteNotRevocableException,
  AdminUserNotFoundException,
  CannotDisableInvitedAdminException,
  CannotDisableLastAdminException,
  CannotDisableRootAdminException,
  CannotDisableSelfException,
  PlatformAdminNotFoundException,
  PlatformConfigNotFoundException,
  PlatformSettingsNoMethodEnabledException,
  SocialLoginDisallowedGoogleOnlyAdminException,
} from '../exceptions/admin.exceptions';
import type { SetAdminStatusParams, SetAdminStatusResult } from '../types/admin.type';

/** How long an admin invite link stays valid. The invite page states this window, so change both together. */
const INVITE_TTL_DAYS = 7;

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);

  constructor(
    private readonly platformAdminDbService: PlatformAdminDbService,
    private readonly platformSettingsDbService: PlatformSettingsDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService,
    private readonly hashingService: HashingService,
    private readonly queueManager: AddingJobsToQueueManager,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService<EnvConfig>,
    private readonly otpAttemptService: OtpAttemptService,
    private readonly verifyEmailTokenProvider: VerifyEmailTokenProvider
  ) {}

  async getProfile(actor: AuthUser): Promise<AdminProfileResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.findById(admin.id);
    if (!row) {
      throw new AdminUserNotFoundException();
    }
    return AdminProfileResponseDto.from(row);
  }

  /** No session to revoke afterward: a platform admin has no refresh token. */
  async changePassword(actor: AuthUser, dto: ChangeAdminPasswordDto): Promise<void> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.findById(admin.id);
    if (!row) {
      throw new AdminUserNotFoundException();
    }
    if (!row.passwordHash) {
      throw new NoPasswordSetException();
    }

    const currentMatches = await this.hashingService.compare(dto.currentPassword, row.passwordHash);
    if (!currentMatches) {
      throw new InvalidCurrentPasswordException();
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new NewPasswordSameAsCurrentException();
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.platformAdminDbService.updatePasswordHash(admin.id, newPasswordHash);
  }

  /**
   * For admins with no password (Google invite or seeded): proves intent with a fresh OTP from
   * `requestSetPasswordOtp` instead of a current password. No token reissue; admins have no refresh token.
   */
  async setPassword(actor: AuthUser, dto: SetAdminPasswordDto): Promise<{ message: string }> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.findById(admin.id);
    if (!row) {
      throw new AdminUserNotFoundException();
    }
    if (row.passwordHash) {
      throw new PasswordAlreadySetException();
    }

    // Budget spent before comparison so an exhausted account can't be probed for the code.
    // 429 rather than 400 (as in `AuthService.setPassword`): "wait and retry" differs from "wrong code".
    if (!(await this.otpAttemptService.consumeAttempt(admin.email))) {
      throw new HttpException(MESSAGES.AUTH.TOO_MANY_OTP_ATTEMPTS, HttpStatus.TOO_MANY_REQUESTS);
    }

    const otpValid = await this.platformAdminDbService.consumeSetPasswordOtp({
      platformAdminId: admin.id,
      tokenHash: hashAdminSetPasswordOtp(admin.id, dto.otp),
    });
    if (!otpValid) {
      throw new InvalidOtpException();
    }
    // Releases the budget, else a code accepted on the last try locks the account out of OTP-gated actions.
    await this.otpAttemptService.reset(admin.email);

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.platformAdminDbService.updatePasswordHash(admin.id, newPasswordHash);

    return { message: MESSAGES.AUTH.PASSWORD_SET };
  }

  /**
   * Step-up check `setPassword` requires: without it a stolen access token alone could set a password,
   * turning a 15-minute credential into an indefinite one on a Google-only admin.
   */
  async requestSetPasswordOtp(actor: AuthUser): Promise<{ message: string }> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.findById(admin.id);
    if (!row) {
      throw new AdminUserNotFoundException();
    }
    if (row.passwordHash) {
      throw new PasswordAlreadySetException();
    }

    if (await this.otpAttemptService.claimResend(admin.email)) {
      const rawOtp = this.verifyEmailTokenProvider.generate();
      await this.platformAdminDbService.putSetPasswordOtp({
        platformAdminId: admin.id,
        tokenHash: hashAdminSetPasswordOtp(admin.id, rawOtp),
        expiresAt: this.otpExpiresAt().toISOString(),
      });
      this.sendSetPasswordOtpEmail({ email: admin.email, rawOtp });
    }

    return { message: MESSAGES.AUTH.SET_PASSWORD_OTP_ACK };
  }

  /**
   * Persists `platform_admins.locale` and re-signs only the access token so the claim updates immediately.
   * The replacement inherits the presenting token's own deadline: admin sessions are un-renewable, so a
   * full-TTL token here would let a leaked access token be kept alive by pinging this route.
   */
  async updateLocale(actor: AuthUser, dto: UpdateLocaleDto): Promise<UpdateAdminLocaleResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.updateLocale(admin.id, dto.locale);
    if (!row) {
      throw new AdminUserNotFoundException();
    }

    const { accessToken, expiresIn } = this.tokenService.signPlatformAdminAccessToken(
      row,
      remainingSessionSeconds(admin.sessionExpiresAt)
    );

    const response = new UpdateAdminLocaleResponseDto();
    response.accessToken = accessToken;
    response.expiresIn = expiresIn;
    response.admin = AdminProfileResponseDto.from(row);
    return response;
  }

  async listInvites(actor: AuthUser): Promise<AdminInviteResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const rows = await this.platformAdminDbService.listInvites();
    return rows.map(row => AdminInviteResponseDto.from(row));
  }

  /** Only gets the invite out the door; accepting it is `AuthService`'s job. */
  async sendInvite(actor: AuthUser, dto: SendAdminInviteDto): Promise<AdminInviteResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);

    // Deliberately does NOT refuse an email that already belongs to a tenant user: tenant and admin
    // logins are separate routes, cookies and lockout scopes, so nothing can be shadowed.

    // A lapsed invite is not a live claim on the address (nothing sweeps expired invites), so re-inviting
    // replaces it.
    const existing = await this.platformAdminDbService.findByEmail(dto.email);
    if (existing) {
      const isLapsedInvite =
        existing.status === PlatformAdminStatus.INVITED &&
        existing.inviteExpiresAt !== null &&
        new Date(existing.inviteExpiresAt).getTime() <= Date.now();

      if (!isLapsedInvite) {
        throw new AdminEmailAlreadyInvitedException();
      }

      // Cascades to the invite row. Scoped to `status = 'invited'`, so a racing accept makes this a no-op
      // and the insert below fails on the unique email index instead of clobbering a real account.
      await this.platformAdminDbService.deleteExpiredInvite(existing.id);
    }

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // The checks above are read-then-write, so concurrent invites of one address can both pass; the second
    // insert hits `idx_platform_admins_email`, which is mapped to the same 409 instead of a 500.
    let row;
    try {
      row = await this.platformAdminDbService.createInvite({
        email: dto.email,
        invitedByPlatformAdminId: admin.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AdminEmailAlreadyInvitedException();
      }
      throw error;
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.ADMIN_INVITE_SENT,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      targetEmail: dto.email,
    });

    this.sendInviteEmail({ email: dto.email, rawToken });

    return AdminInviteResponseDto.from(row);
  }

  /** Unknown id is 404; an already-accepted invite is 409, since it is still visible in the roster. */
  async revokeInvite(actor: AuthUser, inviteId: string): Promise<void> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const revoked = await this.platformAdminDbService.revokeInvite(inviteId);

    if (revoked.outcome === 'not_found') {
      throw new AdminInviteNotFoundException();
    }
    if (revoked.outcome === 'not_invited') {
      throw new AdminInviteNotRevocableException();
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.ADMIN_INVITE_REVOKED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      targetEmail: revoked.email,
    });
  }

  /**
   * Takes effect on the target's next request (`JwtStrategy` checks status per request). Guards against
   * locking the platform out of its console:
   *  - no changing your own status;
   *  - no disabling an `invited` admin (revoke the invite instead);
   *  - no disabling the seeded root (`invited_by_platform_admin_id IS NULL`): nobody can re-enable it,
   *    so this fires even while other admins are active;
   *  - no disabling the last active admin.
   */
  async setAdminStatus(
    actor: AuthUser,
    params: SetAdminStatusParams
  ): Promise<SetAdminStatusResult> {
    const { targetAdminId, enabled } = params;
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);

    if (targetAdminId === admin.id) {
      throw new CannotDisableSelfException();
    }

    const currentStatus = await this.platformAdminDbService.findStatusById(targetAdminId);
    if (currentStatus === null) {
      throw new PlatformAdminNotFoundException();
    }
    if (currentStatus === PlatformAdminStatus.INVITED) {
      // An invited admin has no password or session; steer to revoke instead.
      throw new CannotDisableInvitedAdminException();
    }

    // Computed unconditionally so the response DTO can reuse it; the guard only fires on disable, so a
    // root left `disabled` (bad seed, manual fix) can still be re-enabled.
    const isRootTarget = await this.platformAdminDbService.isRootAdmin(targetAdminId);
    if (!enabled && isRootTarget) {
      throw new CannotDisableRootAdminException();
    }

    // The last-active-admin guard is NOT enforced here: read-then-write can't stop two admins being
    // disabled concurrently. `setStatusGuardingLastActive` re-checks atomically under an advisory lock;
    // `findStatusById` above only serves the fast, friendly 404/409s.
    const nextStatus = enabled ? PlatformAdminStatus.ACTIVE : PlatformAdminStatus.DISABLED;
    const result = await this.platformAdminDbService.setStatusGuardingLastActive({
      id: targetAdminId,
      status: nextStatus,
    });
    if (result.outcome === 'not_found') {
      // Raced with a delete between the status read above and the guarded write.
      throw new PlatformAdminNotFoundException();
    }
    if (result.outcome === 'last_active') {
      throw new CannotDisableLastAdminException();
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: enabled ? PlatformActivityType.ADMIN_ENABLED : PlatformActivityType.ADMIN_DISABLED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      targetEmail: result.email,
    });

    // Same roster DTO shape the Members tab renders, so the client can swap the row without a refetch.
    return {
      admin: AdminInviteResponseDto.from({
        id: result.id,
        email: result.email,
        status: result.status,
        invitedAt: new Date().toISOString(),
        expiresAt: null,
        isRoot: isRootTarget,
      }),
      message: enabled ? MESSAGES.ADMIN.ADMIN_ENABLED : MESSAGES.ADMIN.ADMIN_DISABLED,
    };
  }

  /**
   * Only fields the caller sent are forwarded: with `exactOptionalPropertyTypes` an omitted field must be
   * absent from the patch, not `undefined` (which would reach Drizzle's `.set()` as a real key).
   * Rejects a patch leaving every sign-in method false (also a DB CHECK) to answer 400 instead of a Postgres 500.
   * `admin.id` is used for `updated_by_platform_admin_id` rather than any caller-supplied value.
   */
  async updatePlatformSettings(
    actor: AuthUser,
    dto: UpdatePlatformSettingsDto
  ): Promise<PlatformSettingsResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);

    const patch: PlatformSettingsPatch = {};
    if (dto.ssoLoginEnabled !== undefined) patch.ssoLoginEnabled = dto.ssoLoginEnabled;
    if (dto.passwordLoginEnabled !== undefined)
      patch.passwordLoginEnabled = dto.passwordLoginEnabled;
    if (dto.socialLoginEnabled !== undefined) patch.socialLoginEnabled = dto.socialLoginEnabled;
    if (dto.inviteMembersEnabled !== undefined)
      patch.inviteMembersEnabled = dto.inviteMembersEnabled;

    const current = await this.platformSettingsDbService.get();
    if (!current) {
      throw new PlatformConfigNotFoundException();
    }

    const resultingSso = patch.ssoLoginEnabled ?? current.ssoLoginEnabled;
    const resultingPassword = patch.passwordLoginEnabled ?? current.passwordLoginEnabled;
    const resultingSocial = patch.socialLoginEnabled ?? current.socialLoginEnabled;
    if (!resultingSso && !resultingPassword && !resultingSocial) {
      throw new PlatformSettingsNoMethodEnabledException();
    }

    // Lockout guard: a Google-only admin has no `password_hash`, so `socialLoginEnabled` is their only way
    // in, and they have no way to add a password themselves.
    // Scoped to the transition: re-asserting an already-off setting is a no-op.
    // Read-then-write: an invite accepted via Google in between slips past. Accepted race: no single-table
    // CHECK can back it (it spans two tables) and the cost is an admin re-enabling a setting.
    if (patch.socialLoginEnabled === false && current.socialLoginEnabled) {
      const googleOnlyAdmins = await this.platformAdminDbService.countActiveGoogleOnlyAdmins();
      if (googleOnlyAdmins > 0) {
        throw new SocialLoginDisallowedGoogleOnlyAdminException(
          MESSAGES.ADMIN.CANNOT_DISABLE_SOCIAL_LOGIN_GOOGLE_ONLY_ADMIN(googleOnlyAdmins)
        );
      }
    }

    // Two admins disabling different methods can both pass the check above; map the CHECK violation
    // back to the same 400.
    let row;
    try {
      row = await this.platformSettingsDbService.update(patch, admin.id);
    } catch (error) {
      if (isCheckViolation(error, 'platform_settings_at_least_one_method_check')) {
        throw new PlatformSettingsNoMethodEnabledException();
      }
      throw error;
    }

    if (!row) {
      throw new PlatformConfigNotFoundException();
    }
    const paymentFeatureEnabled =
      this.configService.get<string>('PAYMENT_FEATURE_ENABLED') === 'true';
    return PlatformSettingsResponseDto.from(row, {
      paymentFeatureEnabled,
      erasureGracePeriodDays: getErasureGracePeriodDays(this.configService),
    });
  }

  /**
   * Fire-and-forget: the invite transaction already committed, so a publish failure must not fail the
   * request (revoke and re-send is the recovery). `!isProduction()` also logs the link so the flow works
   * locally without a mailbox.
   */
  private sendInviteEmail(input: { email: string; rawToken: string }): void {
    const { email, rawToken } = input;
    const inviteLink = buildAdminInviteLink(
      this.configService.get<string>('FRONTEND_URL'),
      rawToken
    );

    if (!isProduction()) {
      this.logger.log(`[dev] Admin invite for ${email}: ${inviteLink}`);
    }

    const job: IAdminInviteEmailJob = {
      email,
      inviteLink,
      expiresIn: `${INVITE_TTL_DAYS} days`,
    };
    void this.queueManager
      .addAdminInviteEmailJob(JobName.ADMIN_INVITE_EMAIL, job)
      .catch(() => undefined);
  }

  /** Shared with `AuthService.otpExpiresAt`: one TTL for every OTP. */
  private otpExpiresAt(): Date {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  private sendSetPasswordOtpEmail(input: { email: string; rawOtp: string }): void {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    const job: IOtpEmailJob = {
      email: input.email,
      otp: input.rawOtp,
      expiresIn: `${ttlMinutes} minutes`,
    };
    void this.queueManager
      .addAdminSetPasswordOtpEmailJob(JobName.ADMIN_SET_PASSWORD_OTP_EMAIL, job)
      .catch(() => undefined);
  }
}
