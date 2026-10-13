import { MESSAGES } from '@common/constants/messages.constants';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

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

/** No default message: it always carries the affected admin count. */
export class SocialLoginDisallowedGoogleOnlyAdminException extends BadRequestException {
  constructor(message: string) {
    super({ message, code: 'SOCIAL_LOGIN_DISALLOWED_GOOGLE_ONLY_ADMIN' });
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

/** Unknown, never flagged, or already handled. */
export class PostErasureChargeNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.ADMIN.POST_ERASURE_CHARGE_NOT_FOUND) {
    super({ message, code: 'POST_ERASURE_CHARGE_NOT_FOUND' });
  }
}
