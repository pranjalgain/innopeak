import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import {
  InvalidCurrentPasswordException,
  InvalidOtpException,
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
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { HashingService } from '@common/hashing/hashing.service';
import { isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { isCheckViolation, isUniqueViolation } from '@db/helpers/pg-error.util';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import type { PlatformSettingsPatch } from '@db/repositories/platform-settings/platform-settings.repository';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import type { UpdateLocaleDto } from '../../auth/dto/update-locale.dto';
import type { AuthUser } from '../../auth/types/auth-user.type';
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

/** Matches the frontend mock's own window — see `PlatformAdminInviteService`. */
const INVITE_TTL_DAYS = 7;

export interface SetAdminStatusParams {
  targetAdminId: string;
  enabled: boolean;
}

/** `message` rides along so the controller never has to branch on `enabled` itself to pick
 *  between `MESSAGES.ADMIN.ADMIN_ENABLED`/`ADMIN_DISABLED` — that decision belongs here. */
export interface SetAdminStatusResult {
  admin: AdminInviteResponseDto;
  message: string;
}

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

  /**
   * Same shape as `AuthService.changePassword`: proof of the current password, then a new hash.
   * No session to revoke afterward — a platform admin has no refresh-token concept yet (see
   * `TokenService.signPlatformAdminAccessToken`), so there is nothing else to rotate.
   */
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

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.platformAdminDbService.updatePasswordHash(admin.id, newPasswordHash);
  }

  /**
   * The admin-side counterpart to `AuthService.setPassword` — for an admin who has never had a
   * password (accepted their invite via Google, or was seeded/created before this flow existed),
   * so there is no current password for `changePassword` to check. Proves intent with a fresh OTP
   * from `requestSetPasswordOtp` instead — see that method's own doc comment for why an access
   * token alone is not proof enough. No token to reissue afterward: unlike the tenant flow, a
   * platform admin has no refresh token, so there is nothing else to rotate — the current access
   * token simply keeps running its own 15-minute clock.
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

    // Budget spent before comparison, same shape as the tenant flow — an exhausted account can't
    // be probed for the code at all. 429 rather than 400, matching `AuthService.setPassword`:
    // "wait and retry" is a different answer from "that code is wrong".
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
    // Releases the budget the attempts above spent — without this a code accepted on the last
    // allowed try leaves the account locked out of every OTP-gated action for the rest of the
    // window, despite having just succeeded.
    await this.otpAttemptService.reset(admin.email);

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.platformAdminDbService.updatePasswordHash(admin.id, newPasswordHash);

    return { message: MESSAGES.AUTH.PASSWORD_SET };
  }

  /**
   * Step-up verification `setPassword` requires before it will act — same reasoning as
   * `AuthService.requestSetPasswordOtp`'s own doc comment: without this, `setPassword` would be
   * reachable by anyone holding a stolen access token alone, turning a 15-minute credential into
   * an indefinite one on any Google-only admin. Mailed via the same generic OTP queue job the
   * tenant flow uses (`JobName.ADMIN_SET_PASSWORD_OTP_EMAIL`, same `mfa-code` template), under
   * `platform_admin_invite_purpose`'s own `set_password` value.
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
   * Settings → Profile's language preference — the platform-admin counterpart to
   * `AuthService.updateLocale`. Persists `platform_admins.locale`, then re-signs only the access
   * token (`TokenService.signPlatformAdminAccessToken`, reused as the reissue primitive — a
   * platform admin has no refresh token for this to disturb in the first place, unlike the tenant
   * case that method's own doc comment explains) so the new value is on its `locale` claim
   * immediately rather than waiting for the next login. Without persisting it at all, an admin's
   * choice would silently revert the moment their access token expires and they have to log back
   * in — 15 minutes later, since a platform admin has no refresh token to renew a session with.
   *
   * The replacement token inherits the presenting token's own deadline rather than starting a
   * fresh 15 minutes. That distinction is the whole reason this route is safe to expose: an admin
   * session is deliberately un-renewable, so a route that handed back a full-TTL token every time
   * it was called would let anyone holding a leaked access token keep it alive forever by pinging
   * this endpoint just under the expiry. Refreshing the claim must not move the deadline.
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

  /**
   * Creates the invited admin's row and its invite token, emails the invite link (or a Google-SSO
   * alternative — see `GET /v1/auth/invite/:token/google`), and returns the roster row. Accepting
   * either path is `AuthService.acceptAdminInvite`/`completeAdminInviteGoogle`'s job, not this
   * method's — this only gets the invite out the door.
   */
  async sendInvite(actor: AuthUser, dto: SendAdminInviteDto): Promise<AdminInviteResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);

    // Deliberately does NOT refuse an email that already belongs to a tenant user. This used to
    // 409 (`EMAIL_BELONGS_TO_TENANT_USER`), because a single shared `login` had to resolve one
    // email to exactly one of `platform_admins`/`users` and checked `platform_admins` first —
    // so an accepted invite would have silently shadowed the tenant account. Since the
    // tenant/admin login split there is nothing left to shadow: the two credentials live on two
    // routes (`POST /v1/auth/login` and `POST /v1/admin/auth/login`), two cookies, and two
    // lockout scopes, and `AuthService.signup` already dropped its mirror of this guard. Blocking
    // here would have left the relaxation one-directional — an admin could become a tenant, but
    // an existing tenant could never be made an admin, which is the direction that actually
    // matters when staffing the console from people who already use the product. See the
    // dual-identity decision in `separate-admin-login-design.md`.

    // A lapsed invite is not a live claim on this address. Previously any existing row answered
    // 409, and since nothing expires or sweeps `platform_admin_invites`, a single invite that was
    // never accepted burned that email permanently — the only escape was to notice the stale row
    // in the roster and revoke it by hand. Re-inviting now replaces it, which is what "send
    // invite" already means to the person clicking it.
    const existing = await this.platformAdminDbService.findByEmail(dto.email);
    if (existing) {
      const isLapsedInvite =
        existing.status === PlatformAdminStatus.INVITED &&
        existing.inviteExpiresAt !== null &&
        new Date(existing.inviteExpiresAt).getTime() <= Date.now();

      if (!isLapsedInvite) {
        throw new AdminEmailAlreadyInvitedException();
      }

      // Cascades to the invite row. Safe against an accepted admin: the delete is scoped to
      // `status = 'invited'`, so a race that accepts the invite in between is a no-op here and the
      // insert below then fails on the unique email index rather than clobbering a real account.
      await this.platformAdminDbService.deleteExpiredInvite(existing.id);
    }

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // The `findByEmail` checks above are read-then-write, so two admins inviting the same address
    // at once (or one double-clicking — the route allows 5/min) can both pass them and the second
    // insert still hits `idx_platform_admins_email`. That is the index doing its job; catching it
    // turns what was a raw 500 into the same 409 the guard above would have given.
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

  /**
   * The two failure modes answer differently: an unknown id is a 404, while an id that exists but
   * has already been accepted is a 409 — the invite is still visible in the roster, so telling
   * that admin "Invite not found" describes something they can plainly see is there.
   */
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
   * Disables or re-enables another platform admin. This is what makes the disabled state reachable
   * at all — nothing in `src/` wrote `platform_admins.status` before, so an admin could only be
   * disabled by hand in the DB. Paired with the per-request status check in `JwtStrategy`, a
   * disable takes effect on the target's very next request rather than lingering for the token's
   * 15-minute life.
   *
   * Four guards, all to prevent locking the platform out of its own admin console:
   *  - you cannot change your own status (an admin disabling themselves is only ever a mistake);
   *  - you cannot disable an `invited` admin (it has no active session to end — revoke the invite);
   *  - you cannot disable the seeded root admin (`invited_by_platform_admin_id IS NULL`) — it has
   *    no inviter to re-enable it and no self-service signup exists to create a replacement, so
   *    this fires even while other admins are still active, not only when root is the last one;
   *  - you cannot disable the last remaining active admin (that would leave no one able to
   *    re-enable anyone, and there is no other creation path but the one-time root seed).
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
      // An invited admin has no password and no session — "disabling" it is meaningless, and
      // enabling it would skip the (unbuilt) accept-invite flow. Steer to revoke instead.
      throw new CannotDisableInvitedAdminException();
    }

    // Computed unconditionally (not just when disabling) so the same value can populate the
    // response DTO below without a second lookup — the guard itself only fires on disable: if
    // root were ever somehow left `disabled` (bad seed data, a manual DB fix mid-migration),
    // re-enabling it must still work.
    const isRootTarget = await this.platformAdminDbService.isRootAdmin(targetAdminId);
    if (!enabled && isRootTarget) {
      throw new CannotDisableRootAdminException();
    }

    // The last-active-admin guard itself is NOT enforced here: a plain read-then-write (count
    // active, then write if > 1) can't actually prevent two different admins from being disabled
    // concurrently, since each disable touches a different row and neither blocks the other's
    // count query. `setStatusGuardingLastActive` re-checks the count atomically, inside the same
    // transaction as the write, guarded by an advisory lock that serializes every concurrent
    // status change. This `findStatusById` above stays only for the fast, friendly 404/409s.
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

    // Reuses the roster DTO shape the Members tab already renders (id/email/status), so the client
    // can swap the row in place without a refetch. `invitedAt`/`expiresAt` are not meaningful for a
    // status change and are surfaced as the admin's own timestamps by `listInvites` anyway.
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
   * Partial by design (see `UpdatePlatformSettingsDto`) — only the fields the caller actually
   * sent are forwarded to the DB service. `exactOptionalPropertyTypes` means an omitted DTO field
   * must not appear in the patch object at all (an explicit `undefined` value is a type error and,
   * were it not, would reach Drizzle's `.set()` as a real key), so this is built up field by field
   * rather than spread directly from `dto`.
   *
   * Rejects a patch that would leave `ssoLoginEnabled`/`passwordLoginEnabled`/`socialLoginEnabled`
   * all false — a tenant with zero working sign-in methods is a real outage, not just a UX gap.
   * The same invariant is also a DB-level CHECK constraint (`platform_settings_at_least_one_method_check`)
   * as defense-in-depth against a future write path that skips this service; this check exists
   * mainly to answer with a clean 400 instead of a raw Postgres constraint-violation 500. Note
   * this has nothing to do with *admin* login specifically — a platform admin's own password
   * field on `/login` is unconditional regardless of what this table says (see `LoginView`'s own
   * comment), since admins have no SSO identity to fall back on at all yet.
   *
   * `admin.id` — not part of `patch` — is threaded through to `update()` so
   * `platform_settings.updated_by_platform_admin_id` always reflects whoever is actually calling,
   * rather than trusting a caller-supplied value for who made the change.
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

    // Third guard of the same family as the two above and `setAdminStatus`'s own: refuse a change
    // that would lock a platform admin out of the console.
    //
    // An admin who accepted their invite through Google has no `password_hash` at all (see
    // `AuthService.completeAdminInviteGoogle`), so `socialLoginEnabled` — which is what decides
    // whether the login screen offers a Google button — is the *only* thing standing between them
    // and no way in. There is no admin equivalent of the tenant `set-password` flow for them to
    // add a password with, and `changePassword` above requires a current password they don't have,
    // so the lockout would only be escapable by another admin turning this back on.
    //
    // Scoped to the transition, not the resulting state: re-asserting `false` when it is already
    // off changes nothing, and answering 400 to a no-op would be surprising. (An admin stranded
    // by that pre-existing state is recovered the same way — turn it back on.)
    //
    // Read-then-write, like the sign-in-methods check above: an invite accepted through Google in
    // the window between this count and the UPDATE would slip past. Left as a documented race
    // rather than locked down — unlike that check there is no single-table CHECK constraint that
    // could back it up (the invariant spans `platform_admins` and `platform_admin_identities`),
    // and the consequence is one admin re-enabling a setting, not data loss.
    if (patch.socialLoginEnabled === false && current.socialLoginEnabled) {
      const googleOnlyAdmins = await this.platformAdminDbService.countActiveGoogleOnlyAdmins();
      if (googleOnlyAdmins > 0) {
        throw new SocialLoginDisallowedGoogleOnlyAdminException(
          MESSAGES.ADMIN.CANNOT_DISABLE_SOCIAL_LOGIN_GOOGLE_ONLY_ADMIN(googleOnlyAdmins)
        );
      }
    }

    // The check above reads then writes, so two admins each disabling a *different* method can
    // both pass it against the same `current` and the second UPDATE still trips the CHECK. Mapping
    // it back to the same 400 keeps the answer identical whether the invariant was caught here or
    // by the database.
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
    return PlatformSettingsResponseDto.from(row);
  }

  /**
   * Fire-and-forget, same shape as `AuthService.sendOtpEmail` — the transaction that created this
   * invite already committed, so a queue-publish failure must not fail the whole request; revoking
   * and re-sending is the recovery path for "the email never arrived."
   *
   * `!isProduction()` (this codebase's one dev/prod gate, since `NODE_ENV` only validates to
   * `development`/`production` — see `env-config.module.ts`'s Joi schema) additionally logs the
   * link directly, so the flow is exercisable locally without a working mailbox — the same spirit
   * as `NoopEmailProvider`, which already logs "would have sent to X" for every non-production
   * environment. This is a deliberate, explicit `Logger.log` call, not a debug-level payload dump
   * (see `redactJobSecrets` for why that distinction matters).
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

  /** Same config key `AuthService.otpExpiresAt` reads — one shared TTL for every OTP this app
   *  mails, tenant or admin. */
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
