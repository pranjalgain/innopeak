# API Patterns

Conventions for building API endpoints in this NestJS project.

## Controller Setup

### Business Controllers (versioned)

```ts
@Controller({ path: RouteNames.PAYMENTS, version: '1' })  // -> /v1/payments
@ApiTags('Payments')
@ApiBearerAuth()
export class PaymentsController { }
```

### Infrastructure Controllers (unversioned)

```ts
import { VERSION_NEUTRAL } from '@nestjs/common';

@Controller({ path: RouteNames.HEALTH, version: VERSION_NEUTRAL })  // -> /health
@ApiTags('Health')
@Public()
export class HealthController { }
```

Infrastructure endpoints (health, metrics, tracing, dev-tools) use `VERSION_NEUTRAL` — they are operational, not part of the versioned API contract.

### Versioning

- Type: `VersioningType.URI` with `defaultVersion: '1'` (configured in `main.ts`)
- Route paths: always use the `RouteNames` enum from `src/common/route-names.ts`
- Swagger UI: per-version docs at `/api/v1`, `/api/v2`, etc. (`/api` redirects to latest)

### Adding a New API Version

1. Create a new controller with `version: '2'` (either a separate file or per-route `@Version('2')`):

```ts
// Option A: Separate v2 controller (recommended for large changes)
@Controller({ path: RouteNames.USERS, version: '2' })
@ApiTags('Users')
export class UsersV2Controller { }

// Option B: Per-route versioning (for small additions)
@Controller({ path: RouteNames.USERS })
export class UsersController {
  @Version('1')
  @Get()
  findAllV1() { }

  @Version('2')
  @Get()
  findAllV2() { }
}
```

2. Register the module in the `V2_MODULES` array in `main.ts` Swagger setup
3. A new Swagger doc will be available at `/api/v2`

## Swagger Decorators

```ts
@Post()
@ApiOperation({ summary: 'Create a payment' })
@ApiResponse({ status: 201, description: 'Payment created' })
async create(@Body() dto: CreatePaymentDto) { }

@Get(':id')
@ApiOperation({ summary: 'Get payment by ID' })
@ApiParam({ name: 'id', type: String, description: 'Payment UUID' })
async findById(@Param('id', ParseUUIDPipe) id: string) { }

@Get()
@ApiOperation({ summary: 'List payments' })
@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
@ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
async list(
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
) { }
```

## Response Format

The `TransformInterceptor` (global) wraps all responses:

```json
{ "statusCode": 200, "status": "Success", "message": "Request successful", "data": { }, "error": null }
```

Controllers return raw data -- the interceptor wraps automatically. Type: `src/common/dto/api-response.ts`.

## Error Responses

The `HttpExceptionFilter` (global) catches all exceptions:

```json
{ "statusCode": 404, "status": "Failure", "message": "Payment not found", "data": null, "error": "Not Found", "traceId": "uuid" }
```

Throw standard NestJS exceptions in services:

```ts
throw new NotFoundException('Payment not found');
throw new ForbiddenException('Not your resource');
throw new BadRequestException('Invalid amount');
```

## DTO Patterns

**CreateXDto** -- validation with `class-validator`:
```ts
export class CreatePaymentDto {
  @ApiProperty({ example: 2500 }) @IsNumber() @Min(1) amount!: number;
  @ApiProperty({ example: 'usd' }) @IsString() @IsNotEmpty() currency!: string;
}
```

**UpdateXDto** -- all fields `@IsOptional()`:
```ts
export class UpdatePaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
```

**XResponseDto** -- output shape with static factory:
```ts
export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() amount!: number;
  static from(p: Payment): PaymentResponseDto {
    const dto = new PaymentResponseDto();
    Object.assign(dto, { id: p.id, amount: p.amount });
    return dto;
  }
}
```

## Pagination Pattern

All list endpoints return `{ data: [], meta: { page, pageSize, total, totalPages } }`:

```ts
@Get()
async list(
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
) {
  const result = await this.service.findAll(page, pageSize);
  return {
    data: result.data.map((item) => ResponseDto.from(item)),
    meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
  };
}
```

## Guard Decorators

Global guard order: `ThrottlerGuard -> JwtAuthGuard -> RolesGuard -> PermissionsGuard`.
All routes require JWT by default.

```ts
@Public()              // Skip auth entirely
@Roles('admin')        // Require admin OR moderator (OR logic)
@Permissions('p:read') // Require ALL listed permissions (AND logic)
@CurrentUser()         // Extract AuthUser from request
@CurrentUser('email')  // Extract single field
```

Decorators: `src/auth/decorators/public.decorator.ts`, `roles.decorator.ts`, `permissions.decorator.ts`, `current-user.decorator.ts`.

## Validation

`ValidationPipe` is applied globally in `main.ts`:

```ts
new ValidationPipe({
  whitelist: true,              // Strip unknown properties
  forbidNonWhitelisted: true,   // Error on unknown properties
  transform: true,              // Auto-transform to DTO instances
  transformOptions: { enableImplicitConversion: true },
})
```

No per-controller setup needed -- just use `class-validator` decorators on DTOs.
