/**
 * Server-side view model rendered by `views/dev-tools-queues.pug` (not a JSON API response,
 * so it isn't decorated with `@ApiProperty`/exposed via Swagger).
 */
export class QueueDepthDto {
  queueName!: string;
  mainDepth!: number;
  dlqDepth!: number | null;
}
