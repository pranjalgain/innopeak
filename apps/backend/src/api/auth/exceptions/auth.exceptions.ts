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

export class GooglePendingSignupExpiredException extends BadRequestException {
  constructor(message: string = MESSAGES.AUTH.GOOGLE_PENDING_SIGNUP_EXPIRED) {
    super({ message, code: 'GOOGLE_PENDING_SIGNUP_EXPIRED' });
  }
}

/** Thrown by `JwtStrategy` when a platform-admin token's account is no longer active — distinct
 *  from `AccountDisabledException` (403, refused at login) since here a previously valid token is
 *  being invalidated mid-session, which is a 401. */
export class PlatformAdminAccountDisabledException extends UnauthorizedException {
  constructor(message: string = MESSAGES.AUTH.ACCOUNT_DISABLED) {
    super({ message, code: 'PLATFORM_ADMIN_ACCOUNT_DISABLED' });
  }
}
