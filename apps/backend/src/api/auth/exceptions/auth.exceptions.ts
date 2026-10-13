import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

export class TenantOnlyException extends ForbiddenException {
  constructor(message: string = MESSAGES.AUTH.TENANT_ONLY) {
    super({ message, code: 'TENANT_ONLY' });
  }
}

export class PlatformAdminOnlyException extends ForbiddenException {
  constructor(message: string = MESSAGES.ADMIN.ADMIN_ONLY) {
    super({ message, code: 'PLATFORM_ADMIN_ONLY' });
  }
}

export class AccountDisabledException extends ForbiddenException {
  constructor(message: string = MESSAGES.AUTH.ACCOUNT_DISABLED) {
    super({ message, code: 'ACCOUNT_DISABLED' });
  }
}

export class TenantSuspendedException extends ForbiddenException {
  constructor(message: string = MESSAGES.AUTH.TENANT_SUSPENDED) {
    super({ message, code: 'TENANT_SUSPENDED' });
  }
}

export class InvalidOtpException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP) {
    super({ message, code: 'INVALID_OTP' });
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor(message: string = MESSAGES.AUTH.INVALID_CREDENTIALS) {
    super({ message, code: 'INVALID_CREDENTIALS' });
  }
}

export class NoPasswordSetException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.NO_PASSWORD_SET) {
    super({ message, code: 'NO_PASSWORD_SET' });
  }
}

export class InvalidCurrentPasswordException extends UnauthorizedException {
  constructor(message: string = MESSAGES.AUTH.INVALID_CURRENT_PASSWORD) {
    super({ message, code: 'INVALID_CURRENT_PASSWORD' });
  }
}

/** The new password equals the current one: "changing" it would revoke every other session for nothing. */
export class NewPasswordSameAsCurrentException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.NEW_PASSWORD_SAME_AS_CURRENT) {
    super({ message, code: 'NEW_PASSWORD_SAME_AS_CURRENT' });
  }
}

export class PasswordAlreadySetException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.PASSWORD_ALREADY_SET) {
    super({ message, code: 'PASSWORD_ALREADY_SET' });
  }
}

export class InvalidAccessTokenException extends UnauthorizedException {
  constructor(message: string = MESSAGES.AUTH.INVALID_ACCESS_TOKEN) {
    super({ message, code: 'INVALID_ACCESS_TOKEN' });
  }
}

export class InvalidRefreshTokenException extends UnauthorizedException {
  constructor(message: string = MESSAGES.AUTH.INVALID_REFRESH_TOKEN) {
    super({ message, code: 'INVALID_REFRESH_TOKEN' });
  }
}

export class EmailAlreadyRegisteredException extends ConflictException {
  constructor(message: string = MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED) {
    super({ message, code: 'EMAIL_ALREADY_REGISTERED' });
  }
}

export class InviteNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE) {
    super({ message, code: 'INVITE_NOT_FOUND' });
  }
}

export class InvalidOrExpiredInviteException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE) {
    super({ message, code: 'INVALID_OR_EXPIRED_INVITE' });
  }
}

export class SsoPendingSignupExpiredException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.SSO_PENDING_SIGNUP_EXPIRED) {
    super({ message, code: 'SSO_PENDING_SIGNUP_EXPIRED' });
  }
}

/** Unlike `AccountDisabledException` (403 at login), a previously valid token is invalidated mid-session, hence 401. */
export class PlatformAdminAccountDisabledException extends UnauthorizedException {
  constructor(message: string = MESSAGES.AUTH.ACCOUNT_DISABLED) {
    super({ message, code: 'PLATFORM_ADMIN_ACCOUNT_DISABLED' });
  }
}

export class BusinessNameMismatchException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.BUSINESS_NAME_MISMATCH) {
    super({ message, code: 'BUSINESS_NAME_MISMATCH' });
  }
}

export class PasswordRequiredToDeleteException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.PASSWORD_REQUIRED_TO_DELETE) {
    super({ message, code: 'PASSWORD_REQUIRED' });
  }
}

export class AccountDeletionNotPossibleException extends ConflictException {
  constructor(message: string = MESSAGES.AUTH.ACCOUNT_DELETION_NOT_POSSIBLE) {
    super({ message, code: 'ACCOUNT_DELETION_NOT_POSSIBLE' });
  }
}

/**
 * Thrown only after the password is proven, so naming the situation reveals nothing to someone who
 * merely knows the email. The date rides in the message because the error envelope carries only
 * `message` and `code`.
 */
export class AccountScheduledForDeletionException extends ForbiddenException {
  constructor(scheduledFor: Date) {
    super({
      message: MESSAGES.AUTH.ACCOUNT_SCHEDULED_FOR_DELETION(
        scheduledFor.toISOString().slice(0, 10)
      ),
      code: 'ACCOUNT_SCHEDULED_FOR_DELETION',
    });
  }
}
