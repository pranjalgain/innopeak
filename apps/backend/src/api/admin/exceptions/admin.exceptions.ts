import { MESSAGES } from '@common/constants/messages.constants';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

export class AdminUserNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.ADMIN.USER_NOT_FOUND) {
    super({ message, code: 'ADMIN_USER_NOT_FOUND' });
  }
}

/** The platform-wide settings singleton row could not be found on the admin write path — see
 *  `PlatformConfigMissingException` (`src/api/settings/exceptions/settings.exceptions.ts`) for the
 *  public read path's 500 for the same underlying row. */
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

/** No fixed default: `message` always carries the affected admin count
 *  (`MESSAGES.ADMIN.CANNOT_DISABLE_SOCIAL_LOGIN_GOOGLE_ONLY_ADMIN(count)`), so every call site
 *  supplies it explicitly. */
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
