import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { CONNECTION_ERROR_CODES } from '../constants/connections.constants';

export class ProviderNotConfiguredException extends ServiceUnavailableException {
  constructor(message: string = MESSAGES.CONNECTIONS.PROVIDER_NOT_CONFIGURED) {
    super({ message, code: CONNECTION_ERROR_CODES.PROVIDER_NOT_CONFIGURED });
  }
}

export class ExternalLocationNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.CONNECTIONS.EXTERNAL_LOCATION_NOT_FOUND) {
    super({ message, code: CONNECTION_ERROR_CODES.EXTERNAL_LOCATION_NOT_FOUND });
  }
}

export class LocationLimitReachedException extends ConflictException {
  constructor(message: string = MESSAGES.CONNECTIONS.LOCATION_LIMIT_REACHED) {
    super({ message, code: CONNECTION_ERROR_CODES.LOCATION_LIMIT_REACHED });
  }
}

export class LocationNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.CONNECTIONS.LOCATION_NOT_FOUND) {
    super({ message, code: CONNECTION_ERROR_CODES.LOCATION_NOT_FOUND });
  }
}

export class LocationInactiveException extends ConflictException {
  constructor(message: string = MESSAGES.CONNECTIONS.LOCATION_INACTIVE) {
    super({ message, code: CONNECTION_ERROR_CODES.LOCATION_INACTIVE });
  }
}

export class ConnectionNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.CONNECTIONS.CONNECTION_NOT_FOUND) {
    super({ message, code: CONNECTION_ERROR_CODES.CONNECTION_NOT_FOUND });
  }
}

export class BackfillEnqueueFailedException extends ServiceUnavailableException {
  constructor(message: string = MESSAGES.CONNECTIONS.BACKFILL_ENQUEUE_FAILED) {
    super({ message, code: CONNECTION_ERROR_CODES.BACKFILL_ENQUEUE_FAILED });
  }
}

export class ConnectionNeedsReauthException extends ConflictException {
  constructor(message: string = MESSAGES.CONNECTIONS.CONNECTION_NEEDS_REAUTH) {
    super({ message, code: CONNECTION_ERROR_CODES.CONNECTION_NEEDS_REAUTH });
  }
}

export class ProviderUnavailableException extends BadGatewayException {
  constructor(message: string = MESSAGES.CONNECTIONS.PROVIDER_UNAVAILABLE) {
    super({ message, code: CONNECTION_ERROR_CODES.PROVIDER_UNAVAILABLE });
  }
}
