import type { HealthCheckResponseDto } from './health-check-response.dto';

/**
 * Server-side view model rendered by `views/health.pug` (not a JSON API response,
 * so it isn't decorated with `@ApiProperty`/exposed via Swagger).
 */
export class HealthUiViewModelDto {
  status!: HealthCheckResponseDto['status'];
  info!: HealthCheckResponseDto['info'];
  user!: string;
}
