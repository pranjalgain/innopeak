import { MESSAGES } from '@common/constants/messages.constants';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { PROMPT_ERROR_CODES } from '../constants/prompts.constants';

/** No fixed default: `message` always names the specific unknown placeholder(s)
 *  (`MESSAGES.PROMPTS.UNKNOWN_VARIABLE(names)`), so every call site supplies it explicitly. */
export class UnknownPlaceholderException extends BadRequestException {
  constructor(message: string) {
    super({ message, code: PROMPT_ERROR_CODES.UNKNOWN_PLACEHOLDER });
  }
}

/** No fixed default: `message` always names the specific missing placeholder(s)
 *  (`MESSAGES.PROMPTS.MISSING_VARIABLE(names)`), so every call site supplies it explicitly. */
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

/** `?version=N` (or a versions-scoped route) names a version this prompt has never had —
 *  distinct from `PromptNotFoundException`, which means the prompt itself doesn't exist for this
 *  tenant. See `apps/documentation/docs/backend/prompts/api-reference.md#error-reference`. */
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
