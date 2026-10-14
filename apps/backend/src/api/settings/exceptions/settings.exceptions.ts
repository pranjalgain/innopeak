import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

export class NotificationSettingsDisabledException extends ForbiddenException {
  constructor(message: string = MESSAGES.SETTINGS.NOTIFICATION_SETTINGS_DISABLED) {
    super({ message, code: 'NOTIFICATION_SETTINGS_DISABLED' });
  }
}

export class MemberInvitesDisabledException extends ForbiddenException {
  constructor(message: string = MESSAGES.SETTINGS.MEMBER_INVITES_DISABLED) {
    super({ message, code: 'MEMBER_INVITES_DISABLED' });
  }
}

export class MemberEmailAlreadyInvitedException extends ConflictException {
  constructor(message: string = MESSAGES.SETTINGS.MEMBER_EMAIL_ALREADY_INVITED) {
    super({ message, code: 'MEMBER_EMAIL_ALREADY_INVITED' });
  }
}

export class MemberNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.SETTINGS.MEMBER_NOT_FOUND) {
    super({ message, code: 'MEMBER_NOT_FOUND' });
  }
}

export class MemberInviteNotRevocableException extends ConflictException {
  constructor(message: string = MESSAGES.SETTINGS.MEMBER_INVITE_NOT_REVOCABLE) {
    super({ message, code: 'MEMBER_INVITE_NOT_REVOCABLE' });
  }
}

export class CannotRemoveLastOwnerException extends BadRequestException {
  constructor(message: string = MESSAGES.SETTINGS.CANNOT_REMOVE_LAST_OWNER) {
    super({ message, code: 'CANNOT_REMOVE_LAST_OWNER' });
  }
}

export class CannotRemoveSelfException extends BadRequestException {
  constructor(message: string = MESSAGES.SETTINGS.CANNOT_REMOVE_SELF) {
    super({ message, code: 'CANNOT_REMOVE_SELF' });
  }
}

export class MemberRemovalNotPendingException extends ConflictException {
  constructor(message: string = MESSAGES.SETTINGS.MEMBER_REMOVAL_NOT_PENDING) {
    super({ message, code: 'MEMBER_REMOVAL_NOT_PENDING' });
  }
}

export class BlocklistTermExistsException extends ConflictException {
  constructor(message: string = MESSAGES.SETTINGS.BLOCKLIST_TERM_EXISTS) {
    super({ message, code: 'BLOCKLIST_TERM_EXISTS' });
  }
}

export class BlocklistLimitReachedException extends ConflictException {
  constructor(message: string = MESSAGES.SETTINGS.BLOCKLIST_LIMIT_REACHED) {
    super({ message, code: 'BLOCKLIST_LIMIT_REACHED' });
  }
}

export class BlocklistTermNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.SETTINGS.BLOCKLIST_TERM_NOT_FOUND) {
    super({ message, code: 'BLOCKLIST_TERM_NOT_FOUND' });
  }
}

export class NotificationRecipientNoFieldsException extends BadRequestException {
  constructor(message: string = MESSAGES.SETTINGS.NOTIFICATION_RECIPIENT_NO_FIELDS) {
    super({ message, code: 'NOTIFICATION_RECIPIENT_NO_FIELDS' });
  }
}

export class NotificationRecipientNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.SETTINGS.NOTIFICATION_RECIPIENT_NOT_FOUND) {
    super({ message, code: 'NOTIFICATION_RECIPIENT_NOT_FOUND' });
  }
}

export class TenantSettingsMissingException extends NotFoundException {
  constructor(message: string = MESSAGES.SETTINGS.TENANT_SETTINGS_MISSING) {
    super({ message, code: 'TENANT_SETTINGS_MISSING' });
  }
}

/** Singleton row missing — only if manually deleted from a running deployment, hence 500 (the admin write path raises a 404 instead). */
export class PlatformConfigMissingException extends InternalServerErrorException {
  constructor(message: string = MESSAGES.SETTINGS.PLATFORM_CONFIG_MISSING) {
    super({ message, code: 'PLATFORM_CONFIG_MISSING' });
  }
}
