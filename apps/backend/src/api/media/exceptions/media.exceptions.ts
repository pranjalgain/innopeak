import { MESSAGES } from '@common/constants/messages.constants';
import { BadRequestException } from '@nestjs/common';

export class AvatarUploadNotVerifiedException extends BadRequestException {
  constructor(message: string = MESSAGES.MEDIA.UPLOAD_NOT_VERIFIED) {
    super({ message, code: 'AVATAR_UPLOAD_NOT_VERIFIED' });
  }
}

export class UnsupportedMediaFormatException extends BadRequestException {
  constructor(message: string = MESSAGES.MEDIA.UNSUPPORTED_FORMAT) {
    super({ message, code: 'UNSUPPORTED_MEDIA_FORMAT' });
  }
}

export class MediaFileTooLargeException extends BadRequestException {
  constructor(message: string = MESSAGES.MEDIA.FILE_TOO_LARGE) {
    super({ message, code: 'MEDIA_FILE_TOO_LARGE' });
  }
}
