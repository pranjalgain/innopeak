import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

export class AdminUserNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.ADMIN.USER_NOT_FOUND) {
    super({ message, code: 'ADMIN_USER_NOT_FOUND' });
  }
}

/** Admin write path; the public read path raises `PlatformConfigMissingException` (500) for the same row. */
export class PlatformConfigNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.SETTINGS.PLATFORM_CONFIG_MISSING) {
    super({ message, code: 'PLATFORM_CONFIG_NOT_FOUND' });
  }
}

export class AdminEmailAlreadyInvitedException extends ConflictException {
  constructor(message: string = MESSAGES.ADMIN.EMAIL_ALREADY_INVITED) {
    super({ message, code: 'ADMIN_EMAIL_ALREADY_INVITED' });
  }
}

export class AdminInviteNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.ADMIN.INVITE_NOT_FOUND) {
    super({ message, code: 'ADMIN_INVITE_NOT_FOUND' });
  }
}

export class AdminInviteNotRevocableException extends ConflictException {
  constructor(message: string = MESSAGES.ADMIN.INVITE_NOT_REVOCABLE) {
    super({ message, code: 'ADMIN_INVITE_NOT_REVOCABLE' });
  }
}

export class CannotDisableSelfException extends BadRequestException {
  constructor(message: string = MESSAGES.ADMIN.CANNOT_DISABLE_SELF) {
    super({ message, code: 'CANNOT_DISABLE_SELF' });
  }
}

export class PlatformAdminNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.ADMIN.ADMIN_NOT_FOUND) {
    super({ message, code: 'PLATFORM_ADMIN_NOT_FOUND' });
  }
}

export class CannotDisableInvitedAdminException extends ConflictException {
  constructor(message: string = MESSAGES.ADMIN.CANNOT_DISABLE_INVITED) {
    super({ message, code: 'CANNOT_DISABLE_INVITED_ADMIN' });
  }
}

export class CannotDisableRootAdminException extends BadRequestException {
  constructor(message: string = MESSAGES.ADMIN.CANNOT_DISABLE_ROOT_ADMIN) {
    super({ message, code: 'CANNOT_DISABLE_ROOT_ADMIN' });
  }
}

export class CannotDisableLastAdminException extends BadRequestException {
  constructor(message: string = MESSAGES.ADMIN.CANNOT_DISABLE_LAST_ADMIN) {
    super({ message, code: 'CANNOT_DISABLE_LAST_ADMIN' });
  }
}

export class PlatformSettingsNoMethodEnabledException extends BadRequestException {
  constructor(message: string = MESSAGES.ADMIN.PLATFORM_SETTINGS_NO_METHOD_ENABLED) {
    super({ message, code: 'PLATFORM_SETTINGS_NO_METHOD_ENABLED' });
  }
}

/** Always carries the provider name and how many users would be locked out; the admin can repeat the request with `confirmLockout`. */
export class SsoLoginDisallowedSsoOnlyUsersException extends BadRequestException {
  constructor(message: string) {
    super({ message, code: 'SSO_LOGIN_DISALLOWED_SSO_ONLY_USERS' });
  }
}

/** The password counterpart: always carries how many users would be locked out; the admin can repeat the request with `confirmLockout`. */
export class PasswordLoginDisallowedPasswordOnlyUsersException extends BadRequestException {
  constructor(message: string) {
    super({ message, code: 'PASSWORD_LOGIN_DISALLOWED_PASSWORD_ONLY_USERS' });
  }
}

export class PlatformSettingsNoUsableMethodException extends BadRequestException {
  constructor(message: string = MESSAGES.ADMIN.PLATFORM_SETTINGS_NO_USABLE_METHOD) {
    super({ message, code: 'PLATFORM_SETTINGS_NO_USABLE_METHOD' });
  }
}

/**
 * 422, not 501: the API logs 5xx at error level with a stack, and an expected refusal should not read as an incident.
 * TODO(notifications): remove with the check in `AdminSettingsService.updatePlatformSettings` once email/Teams delivery exists.
 */
export class NotificationChannelsNotImplementedException extends UnprocessableEntityException {
  constructor(message: string = MESSAGES.ADMIN.NOTIFICATION_CHANNELS_NOT_IMPLEMENTED) {
    super({ message, code: 'NOTIFICATION_CHANNELS_NOT_IMPLEMENTED' });
  }
}

/**
 * Turning the password switch on needs an email service: a password sign-up is completed by an emailed code, and invitations are emailed.
 * 422 for the same reason as above: the request is well formed, the server just cannot honour it yet. Any request to turn it on is refused
 * while email cannot be delivered (see `AdminSettingsService.updatePlatformSettings`), never on a local development machine, where mail is
 * written to the log.
 */
export class PasswordLoginNeedsEmailServiceException extends UnprocessableEntityException {
  constructor(message: string = MESSAGES.ADMIN.PASSWORD_LOGIN_NEEDS_EMAIL_SERVICE) {
    super({ message, code: 'PASSWORD_LOGIN_NEEDS_EMAIL_SERVICE' });
  }
}

export class BusinessNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.ADMIN.BUSINESS_NOT_FOUND) {
    super({ message, code: 'BUSINESS_NOT_FOUND' });
  }
}

/** Suspend/reactivate must not run during a pending erasure, or it leaves `erasure_requested_at`
 *  stale and the nightly purge treats the tenant as overdue. */
export class BusinessErasurePendingException extends ConflictException {
  constructor(message: string = MESSAGES.ADMIN.BUSINESS_ERASURE_PENDING) {
    super({ message, code: 'BUSINESS_ERASURE_PENDING' });
  }
}

/** Cancelling an erasure that is not pending: the business exists, so this is a conflict with its state, not a missing resource. */
export class BusinessErasureNotPendingException extends ConflictException {
  constructor(message: string = MESSAGES.ADMIN.BUSINESS_ERASURE_NOT_PENDING) {
    super({ message, code: 'BUSINESS_ERASURE_NOT_PENDING' });
  }
}

/** Same reasoning as `BusinessErasurePendingException`, at the user level. */
export class UserRemovalPendingException extends ConflictException {
  constructor(message: string = MESSAGES.ADMIN.USER_REMOVAL_PENDING) {
    super({ message, code: 'USER_REMOVAL_PENDING' });
  }
}

/** An invited member who never accepted: flipping them to `disabled` and back would strand the invite (it only redeems an `invited` row). */
export class UserInvitePendingException extends ConflictException {
  constructor(message: string = MESSAGES.ADMIN.USER_INVITE_PENDING) {
    super({ message, code: 'USER_INVITE_PENDING' });
  }
}

/** Unknown, never flagged, or already handled. */
export class PostErasureChargeNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.ADMIN.POST_ERASURE_CHARGE_NOT_FOUND) {
    super({ message, code: 'POST_ERASURE_CHARGE_NOT_FOUND' });
  }
}
