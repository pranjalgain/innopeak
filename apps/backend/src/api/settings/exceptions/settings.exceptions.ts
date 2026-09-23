import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

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

export class BlocklistTermExistsException extends ConflictException {
  constructor(message: string = MESSAGES.SETTINGS.BLOCKLIST_TERM_EXISTS) {
    super({ message, code: 'BLOCKLIST_TERM_EXISTS' });
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

/** The platform-wide settings singleton row is missing entirely — only reachable if it was
 *  manually deleted out from under a running deployment, hence 500. See `PlatformConfigNotFoundException`
 *  (`src/api/admin/exceptions/admin.exceptions.ts`) for the 404 raised on the admin write path. */
export class PlatformConfigMissingException extends InternalServerErrorException {
  constructor(message: string = MESSAGES.SETTINGS.PLATFORM_CONFIG_MISSING) {
    super({ message, code: 'PLATFORM_CONFIG_MISSING' });
  }
}
