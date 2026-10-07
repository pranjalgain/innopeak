import type { HealthCheckResponseDto } from './health-check-response.dto';

/** View model for `views/health.pug`; not a JSON response, so no Swagger decorators. */
export class HealthUiViewModelDto {
  status!: HealthCheckResponseDto['status'];
  info!: HealthCheckResponseDto['info'];
  user!: string;
}
