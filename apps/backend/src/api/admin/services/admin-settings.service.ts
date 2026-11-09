import { OtpScope } from '@auth/enums/otp-scope.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import {
  EmailQueueUnavailableException,
  InvalidCurrentPasswordException,
  InvalidOtpException,
  NewPasswordSameAsCurrentException,
  NoPasswordSetException,
  PasswordAlreadySetException,
} from '@auth/exceptions/auth.exceptions';
import { GoogleIdentityProvider } from '@auth/providers/google-identity.provider';
import { MicrosoftIdentityProvider } from '@auth/providers/microsoft-identity.provider';
import { VerifyEmailTokenProvider } from '@auth/providers/verify-email-token.provider';
import { LoginAttemptScope, LoginAttemptService } from '@auth/services/login-attempt.service';
import { OtpAttemptService } from '@auth/services/otp-attempt.service';
import { TokenService } from '@auth/services/token.service';
import type { PlatformAdminTokenSubject } from '@auth/types/auth.type';
import { buildAdminInviteLink } from '@auth/utils/admin-invite-link.util';
import { isAdminMicrosoftLoginAvailable } from '@auth/utils/admin-microsoft.util';
import { normalizeEmail } from '@auth/utils/email.utils';
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
import { isLocalDevelopment } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { isCheckViolation, isUniqueViolation } from '@db/helpers/pg-error.util';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import type {
  PlatformSettingsPatch,
  PlatformSettingsRow,
} from '@db/repositories/platform-settings/types/platform-settings.type';
import { EmailProvider } from '@email/providers/email.provider';
import { canDeliverEmail } from '@email/utils/email-config.util';
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
  NotificationChannelsNotImplementedException,
  PasswordLoginDisallowedPasswordOnlyUsersException,
  PasswordLoginNeedsEmailServiceException,
  PlatformAdminNotFoundException,
  PlatformConfigNotFoundException,
  PlatformSettingsNoMethodEnabledException,
  PlatformSettingsNoUsableMethodException,
  SsoLoginDisallowedSsoOnlyUsersException,
} from '../exceptions/admin.exceptions';
import type { SetAdminStatusParams, SetAdminStatusResult } from '../types/admin.type';

/** How long an admin invite link stays valid. The invite page states this window, so change both together. */
const INVITE_TTL_DAYS = 7;

/** The platform switches a settings change is diffed over, in the order they are listed in the activity entry. */
const PLATFORM_SETTING_FIELDS = [
  'microsoftLoginEnabled',
  'passwordLoginEnabled',
  'googleLoginEnabled',
  'inviteMembersEnabled',
  'notificationSettingsEnabled',
] as const satisfies ReadonlyArray<keyof PlatformSettingsRow>;

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
    private readonly loginAttemptService: LoginAttemptService,
    private readonly verifyEmailTokenProvider: VerifyEmailTokenProvider,
    private readonly googleIdentityProvider: GoogleIdentityProvider,
    private readonly microsoftIdentityProvider: MicrosoftIdentityProvider,
    private readonly emailProvider: EmailProvider
  ) {}

  async getProfile(actor: AuthUser): Promise<AdminProfileResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.findById(admin.id);
    if (!row) {
      throw new AdminUserNotFoundException();
    }
    return AdminProfileResponseDto.from(row);
  }

  /**
   * Ends the admin's older access tokens (a platform admin has no refresh token to revoke) and hands back a fresh one, signed to the
   * presenting token's own deadline so this cannot extend the session; the controller sets it as the cookie.
   */
  async changePassword(
    actor: AuthUser,
    dto: ChangeAdminPasswordDto
  ): Promise<{ accessToken: string }> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.findById(admin.id);
    if (!row) {
      throw new AdminUserNotFoundException();
    }
    if (!row.passwordHash) {
      throw new NoPasswordSetException();
    }

    // The sign-in budget, shared: a copied access token (15 minutes) could otherwise guess the current password through this route at
    // the per-IP rate with no per-account ceiling. A locked account is answered like a wrong password.
    const budgetKey = normalizeEmail(row.email);
    if (await this.loginAttemptService.isLockedOut(budgetKey, LoginAttemptScope.ADMIN)) {
      throw new InvalidCurrentPasswordException();
    }
    const currentMatches = await this.hashingService.compare(dto.currentPassword, row.passwordHash);
    if (!currentMatches) {
      await this.loginAttemptService.recordFailure(budgetKey, LoginAttemptScope.ADMIN);
      throw new InvalidCurrentPasswordException();
    }
    await this.loginAttemptService.reset(budgetKey, LoginAttemptScope.ADMIN);
    if (dto.newPassword === dto.currentPassword) {
      throw new NewPasswordSameAsCurrentException();
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.platformAdminDbService.updatePasswordHash(admin.id, newPasswordHash);
    return this.reissueAfterPasswordChange(admin, row);
  }

  /**
   * For admins with no password (Google invite or seeded): proves intent with a fresh OTP from
   * `requestSetPasswordOtp` instead of a current password. Older access tokens end and a fresh one is returned, as in `changePassword`.
   */
  async setPassword(
    actor: AuthUser,
    dto: SetAdminPasswordDto
  ): Promise<{ message: string; accessToken: string }> {
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
    if (
      !(await this.otpAttemptService.consumeAttempt({
        scope: OtpScope.ADMIN_SET_PASSWORD,
        identity: admin.id,
      }))
    ) {
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
    await this.otpAttemptService.reset({ scope: OtpScope.ADMIN_SET_PASSWORD, identity: admin.id });

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.platformAdminDbService.updatePasswordHash(admin.id, newPasswordHash);

    return {
      message: MESSAGES.AUTH.PASSWORD_SET,
      ...(await this.reissueAfterPasswordChange(admin, row)),
    };
  }

  private async reissueAfterPasswordChange(
    admin: { id: string; sessionExpiresAt?: number },
    row: PlatformAdminTokenSubject
  ): Promise<{ accessToken: string }> {
    await this.tokenService.revokePlatformAdminSessions(admin.id, { exceptCurrentSecond: true });
    const { accessToken } = this.tokenService.signPlatformAdminAccessToken(
      row,
      remainingSessionSeconds(admin.sessionExpiresAt)
    );
    return { accessToken };
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

    if (
      await this.otpAttemptService.claimResend({
        scope: OtpScope.ADMIN_SET_PASSWORD,
        identity: admin.id,
      })
    ) {
      const rawOtp = this.verifyEmailTokenProvider.generate();
      await this.platformAdminDbService.putSetPasswordOtp({
        platformAdminId: admin.id,
        tokenHash: hashAdminSetPasswordOtp(admin.id, rawOtp),
        expiresAt: this.otpExpiresAt().toISOString(),
      });
      if (!(await this.sendSetPasswordOtpEmail({ email: admin.email, rawOtp }))) {
        await this.otpAttemptService.releaseResend({
          scope: OtpScope.ADMIN_SET_PASSWORD,
          identity: admin.id,
        });
        throw new EmailQueueUnavailableException();
      }
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

    if (!(await this.sendInviteEmail({ email: dto.email, rawToken }))) {
      // Nothing reached the invitee, so the invite is taken back: an invite that exists but was never mailed would only
      // block the address ("already invited") until someone revoked it by hand.
      await this.platformAdminDbService.revokeInvite(row.id).catch((error: unknown) => {
        this.logger.warn(
          `Could not take back invite ${row.id} after its email failed: ${(error as Error).message}`
        );
      });
      throw new EmailQueueUnavailableException();
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.ADMIN_INVITE_SENT,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      targetEmail: dto.email,
    });

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

    // A repeat of the same request writes nothing, so it must not log an activity row either.
    if (result.outcome === 'updated') {
      await this.adminOverviewDbService.recordActivityBestEffort({
        type: enabled ? PlatformActivityType.ADMIN_ENABLED : PlatformActivityType.ADMIN_DISABLED,
        actorPlatformAdminId: admin.id,
        actorEmail: admin.email,
        targetEmail: result.email,
      });
    }

    // The roster's own row, so `invitedAt`/`expiresAt` are the recorded ones and not a stamp made for this response.
    const rosterRow = await this.platformAdminDbService.findInviteRowById(result.id);

    // Same roster DTO shape the Members tab renders, so the client can swap the row without a refetch.
    return {
      admin: AdminInviteResponseDto.from({
        id: result.id,
        email: result.email,
        status: result.status,
        invitedAt: rosterRow?.invitedAt ?? new Date().toISOString(),
        expiresAt: rosterRow?.expiresAt ?? null,
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
    if (dto.microsoftLoginEnabled !== undefined)
      patch.microsoftLoginEnabled = dto.microsoftLoginEnabled;
    if (dto.passwordLoginEnabled !== undefined)
      patch.passwordLoginEnabled = dto.passwordLoginEnabled;
    if (dto.googleLoginEnabled !== undefined) patch.googleLoginEnabled = dto.googleLoginEnabled;
    if (dto.inviteMembersEnabled !== undefined)
      patch.inviteMembersEnabled = dto.inviteMembersEnabled;
    if (dto.notificationSettingsEnabled !== undefined)
      patch.notificationSettingsEnabled = dto.notificationSettingsEnabled;

    // TODO(notifications): delete this check once email/Teams delivery exists; it is the only thing keeping the setting off.
    // Only `true` is refused, so `false` (and re-sending the default) is always accepted.
    if (patch.notificationSettingsEnabled === true) {
      throw new NotificationChannelsNotImplementedException();
    }

    const current = await this.platformSettingsDbService.get();
    if (!current) {
      throw new PlatformConfigNotFoundException();
    }

    // Email/password needs email: a sign-up is completed by an emailed code and invitations are emailed. Without an email service the
    // switch is not in effect whatever is stored (see `PlatformSettingsResponseDto.from`), so any request to turn it on is refused with
    // the reason, even when the stored value is already on. `false` is always accepted. There is no developer-machine exemption: email
    // delivery is not implemented yet, so the switch is off everywhere and nobody can enable it.
    const emailDeliverable = canDeliverEmail(this.emailProvider, this.configService);
    if (patch.passwordLoginEnabled === true && !emailDeliverable) {
      throw new PasswordLoginNeedsEmailServiceException();
    }

    const resultingMicrosoft = patch.microsoftLoginEnabled ?? current.microsoftLoginEnabled;
    const resultingPassword = patch.passwordLoginEnabled ?? current.passwordLoginEnabled;
    const resultingGoogle = patch.googleLoginEnabled ?? current.googleLoginEnabled;
    if (!resultingMicrosoft && !resultingPassword && !resultingGoogle) {
      throw new PlatformSettingsNoMethodEnabledException();
    }

    // A method only counts if it can be used: Microsoft and Google also need their credentials configured on this server, and password
    // needs an email service (its sign-up is completed by an emailed code). Without this, switching the providers off while password is
    // the only method left, on a server that cannot send email, leaves nobody able to sign up, and nothing would say why. Scoped to
    // patches that touch a method, so an unrelated change on a platform already in that state is not refused.
    const touchesMethod =
      patch.microsoftLoginEnabled !== undefined ||
      patch.passwordLoginEnabled !== undefined ||
      patch.googleLoginEnabled !== undefined;
    if (
      touchesMethod &&
      !(resultingPassword && emailDeliverable) &&
      !(resultingMicrosoft && this.microsoftIdentityProvider.isConfigured()) &&
      !(resultingGoogle && this.googleIdentityProvider.isConfigured())
    ) {
      throw new PlatformSettingsNoUsableMethodException();
    }

    // Tenant counterpart of the guard below: a tenant user who joined with Microsoft or Google has no password and the platform has
    // no way to give them one, so turning their provider off locks them out until it is turned back on. Unlike the admin guard this one
    // can be overridden (`confirmLockout`): switching a provider off is also the emergency lever when it is compromised or down, and
    // that must stay possible however many people use it. Same transition scoping and read-then-write race as the admin guard.
    let lockoutConfirmed = false;
    for (const [provider, label, switchedOff] of [
      [
        UserIdentityProvider.GOOGLE,
        'Google',
        patch.googleLoginEnabled === false && current.googleLoginEnabled,
      ],
      [
        UserIdentityProvider.ENTRA_ID,
        'Microsoft',
        patch.microsoftLoginEnabled === false && current.microsoftLoginEnabled,
      ],
    ] as const) {
      if (!switchedOff) {
        continue;
      }
      const stranded = await this.platformSettingsDbService.countActiveSsoOnlyTenantUsers(provider);
      if (stranded > 0) {
        if (dto.confirmLockout !== true) {
          throw new SsoLoginDisallowedSsoOnlyUsersException(
            MESSAGES.ADMIN.CANNOT_DISABLE_SSO_LOGIN_SSO_ONLY_USERS(label, stranded)
          );
        }
        this.logger.warn(
          `Platform admin ${admin.id} switched ${label} sign-in off with ${stranded} active tenant user(s) who can only sign in with it`
        );
        lockoutConfirmed = true;
      }
    }

    // The same guard for the password switch: a tenant user who only ever used a password has no other way in. Only while it is in
    // effect: without an email service it is already off for everyone, so switching the stored value off strands nobody new.
    if (patch.passwordLoginEnabled === false && current.passwordLoginEnabled && emailDeliverable) {
      const stranded = await this.platformSettingsDbService.countActivePasswordOnlyTenantUsers();
      if (stranded > 0) {
        if (dto.confirmLockout !== true) {
          throw new PasswordLoginDisallowedPasswordOnlyUsersException(
            MESSAGES.ADMIN.CANNOT_DISABLE_PASSWORD_LOGIN_PASSWORD_ONLY_USERS(stranded)
          );
        }
        this.logger.warn(
          `Platform admin ${admin.id} switched email/password sign-in off with ${stranded} active tenant user(s) who can only sign in with a password`
        );
        lockoutConfirmed = true;
      }
    }

    // No guard for admins whose only credential is Google: the admin Google intents never consult `googleLoginEnabled` (that switch
    // governs tenant sign-in, sign-up and invites), so switching it off cannot strand them.

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

    await this.recordSettingsChange({ admin, before: current, after: row, lockoutConfirmed });

    const paymentFeatureEnabled =
      this.configService.get<string>('PAYMENT_FEATURE_ENABLED') === 'true';
    return PlatformSettingsResponseDto.from(row, {
      paymentFeatureEnabled,
      erasureGracePeriodDays: getErasureGracePeriodDays(this.configService),
      adminMicrosoftLoginAvailable: isAdminMicrosoftLoginAvailable(this.configService),
      adminGoogleLoginAvailable: this.googleIdentityProvider.isConfigured(),
      emailDeliveryAvailable: canDeliverEmail(this.emailProvider, this.configService),
    });
  }

  /**
   * One activity entry per saved change that actually moved a switch, saying which and from what to what, so the platform's sign-in rules
   * have a history. Best-effort like the other entries: the write already committed. Nothing is recorded when the request re-sent the
   * values it already had.
   */
  private async recordSettingsChange(input: {
    admin: { id: string; email: string };
    before: PlatformSettingsRow;
    after: PlatformSettingsRow;
    lockoutConfirmed: boolean;
  }): Promise<void> {
    const changes = PLATFORM_SETTING_FIELDS.filter(
      field => input.before[field] !== input.after[field]
    ).map(field => ({ field, from: input.before[field], to: input.after[field] }));
    if (changes.length === 0) {
      return;
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.PLATFORM_SETTINGS_CHANGED,
      actorPlatformAdminId: input.admin.id,
      actorEmail: input.admin.email,
      details: { changes, ...(input.lockoutConfirmed ? { lockoutConfirmed: true } : {}) },
    });
  }

  /**
   * `false` when the queue refused the job (the queue manager has logged why); the caller takes the invite back and answers 503.
   * `isLocalDevelopment()` also logs the link so the flow works locally without a mailbox.
   */
  private async sendInviteEmail(input: { email: string; rawToken: string }): Promise<boolean> {
    const { email, rawToken } = input;
    const inviteLink = buildAdminInviteLink(
      this.configService.get<string>('FRONTEND_URL'),
      rawToken
    );

    if (isLocalDevelopment()) {
      this.logger.log(`[dev] Admin invite for ${email}: ${inviteLink}`);
    }

    const job: IAdminInviteEmailJob = {
      email,
      inviteLink,
      expiresIn: `${INVITE_TTL_DAYS} days`,
    };
    try {
      await this.queueManager.addAdminInviteEmailJob(JobName.ADMIN_INVITE_EMAIL, job);
      return true;
    } catch {
      return false;
    }
  }

  /** Shared with `AuthService.otpExpiresAt`: one TTL for every OTP. */
  private otpExpiresAt(): Date {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  /** `false` when the queue refused the job (already logged); never throws. */
  private async sendSetPasswordOtpEmail(input: {
    email: string;
    rawOtp: string;
  }): Promise<boolean> {
    const ttlMinutes = this.configService.get<number>('VERIFY_EMAIL_OTP_TTL_MINUTES') ?? 10;
    const job: IOtpEmailJob = {
      email: input.email,
      otp: input.rawOtp,
      expiresIn: `${ttlMinutes} minutes`,
    };
    try {
      await this.queueManager.addAdminSetPasswordOtpEmailJob(
        JobName.ADMIN_SET_PASSWORD_OTP_EMAIL,
        job
      );
      return true;
    } catch {
      return false;
    }
  }
}
