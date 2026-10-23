import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadGatewayException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AI_ERROR_CODES } from '../constants/ai.constants';

/** No prompt for this tenant + category: a data-integrity anomaly, not a normal response. */
export class AiPromptNotConfiguredException extends NotFoundException {
  constructor(message: string = MESSAGES.AI.PROMPT_NOT_CONFIGURED) {
    super({ message, code: AI_ERROR_CODES.PROMPT_NOT_CONFIGURED });
  }
}

/** `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` unset. 503, not 500: the feature isn't switched on (operator config), not a bug in the request. */
export class AiProviderNotConfiguredException extends ServiceUnavailableException {
  constructor(message: string = MESSAGES.AI.PROVIDER_NOT_CONFIGURED) {
    super({ message, code: AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED });
  }
}

/** Provider call failed (network error, non-2xx, malformed body). 502: the fault is upstream. */
export class AiGenerationFailedException extends BadGatewayException {
  constructor(message: string = MESSAGES.AI.GENERATION_FAILED) {
    super({ message, code: AI_ERROR_CODES.GENERATION_FAILED });
  }
}

/**
 * The provider answered, but with nothing usable (empty content, a content-filter stop). Unlike an outage this is about *this* review's
 * text, so it is the one provider failure that counts toward giving up on the review (`GENERATION_MAX_ATTEMPTS`).
 */
export class AiReplyUnusableException extends AiGenerationFailedException {}
