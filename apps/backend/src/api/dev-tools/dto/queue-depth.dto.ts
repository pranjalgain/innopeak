/** View model for `views/dev-tools-queues.pug`, not a Swagger-exposed API response. */
export class QueueDepthDto {
  queueName!: string;
  mainDepth!: number;
  dlqDepth!: number | null;
}
