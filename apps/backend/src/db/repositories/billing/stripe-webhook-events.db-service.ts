import { DrizzleTransaction } from '@db/db.service';
import { Injectable } from '@nestjs/common';

import { StripeWebhookEventsRepository } from './stripe-webhook-events.repository';

@Injectable()
export class StripeWebhookEventsDbService {
  constructor(private readonly stripeWebhookEventsRepository: StripeWebhookEventsRepository) {}

  /** `true` = this event id was not seen before and should be processed; `false` = duplicate,
   *  skip. See `StripeWebhookEventsRepository.insertIfNew`. */
  recordIfNew(
    id: string,
    type: string,
    customerId: string | null,
    tx?: DrizzleTransaction
  ): Promise<boolean> {
    return this.stripeWebhookEventsRepository.insertIfNew(id, type, customerId, tx);
  }
}
