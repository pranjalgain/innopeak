import { MESSAGES } from '@common/constants/messages.constants';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PROMPT_ERROR_CODES } from '../constants/prompts.constants';

/** No default message: it always names the specific unknown placeholder(s). */
export class UnknownPlaceholderException extends BadRequestException {
  constructor(message: string) {
    super({ message, code: PROMPT_ERROR_CODES.UNKNOWN_PLACEHOLDER });
  }
}

/** No default message: it always names the specific missing placeholder(s). */
export class MissingPlaceholderException extends BadRequestException {
  constructor(message: string) {
    super({ message, code: PROMPT_ERROR_CODES.MISSING_PLACEHOLDER });
  }
}

export class PromptNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.PROMPTS.NOT_FOUND) {
    super({ message, code: 'PROMPT_NOT_FOUND' });
  }
}

/** The prompt exists but never had the requested version; distinct from PromptNotFoundException. */
export class PromptVersionNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.PROMPTS.VERSION_NOT_FOUND) {
    super({ message, code: 'PROMPT_VERSION_NOT_FOUND' });
  }
}

export class TemplateUnchangedException extends ConflictException {
  constructor(message: string = MESSAGES.PROMPTS.TEMPLATE_UNCHANGED) {
    super({ message, code: 'TEMPLATE_UNCHANGED' });
  }
}

export class PromptVersionConflictException extends ConflictException {
  constructor(message: string = MESSAGES.PROMPTS.VERSION_CONFLICT) {
    super({ message, code: 'PROMPT_VERSION_CONFLICT' });
  }
}
