import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadGatewayException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AI_ERROR_CODES } from '../constants/ai.constants';

/** No prompt exists for this tenant + category — see `PromptsDbService.findCurrentForCategory`'s
 *  own doc comment for why this should be a data-integrity anomaly, not a normal response. */
export class AiPromptNotConfiguredException extends NotFoundException {
  constructor(message: string = MESSAGES.AI.PROMPT_NOT_CONFIGURED) {
    super({ message, code: AI_ERROR_CODES.PROMPT_NOT_CONFIGURED });
  }
}

/** `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` unset when a generation call actually runs. `503`, not
 *  `500`: this is "the feature isn't switched on yet" (an operator/config problem), the same class
 *  of failure as `BillingModule`'s `NOT_ENABLED` case, not a bug in the request. */
export class AiProviderNotConfiguredException extends ServiceUnavailableException {
  constructor(message: string = MESSAGES.AI.PROVIDER_NOT_CONFIGURED) {
    super({ message, code: AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED });
  }
}

/** The provider call itself failed (network error, non-2xx response, malformed completion body).
 *  `502`: the fault is upstream, between this server and the model API, mirroring how an upstream
 *  webhook/API failure is reported elsewhere in this codebase. */
export class AiGenerationFailedException extends BadGatewayException {
  constructor(message: string = MESSAGES.AI.GENERATION_FAILED) {
    super({ message, code: AI_ERROR_CODES.GENERATION_FAILED });
  }
}
