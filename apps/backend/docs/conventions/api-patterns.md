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

## Swagger Decorators — one file per controller, not inline

Don't stack `@ApiOperation`/`@ApiResponse`/`@ApiParam`/`@ApiQuery` directly on controller methods.
Compose each route's full Swagger metadata — including a worked request/response example, not
just types — into one exported function per route, all living in that controller's
`swagger/<name>.swagger.ts` file (see `module-structure.md` for the full folder convention). The
controller method then carries exactly one decorator:

```ts
// src/api/payments/swagger/payments.swagger.ts
import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

export function ApiCreatePayment(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({ summary: 'Create a payment' }),
    ApiBody({ type: CreatePaymentDto, examples: { default: { value: { amount: 2500, currency: 'usd', paymentToken: 'tok_visa' } } } }),
    ApiResponse({ status: 201, description: 'Payment created', type: PaymentResponseDto }),
  );
}

export function ApiGetPayment(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({ summary: 'Get payment by ID' }),
    ApiParam({ name: 'id', type: String, description: 'Payment UUID', example: 'a1b2c3d4-5e6f-7890-abcd-ef1234567890' }),
    ApiResponse({ status: 200, type: PaymentResponseDto }),
    ApiResponse({ status: 404, description: 'Payment not found' }),
  );
}

export function ApiListPayments(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({ summary: 'List payments' }),
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 }),
    ApiResponse({ status: 200, type: PaginatedPaymentsDto }),
  );
}
```

```ts
// payments.controller.ts — one Swagger decorator per route, imported from the file above
@Post()
@ApiCreatePayment()
async create(@Body() dto: CreatePaymentDto): Promise<ApiResponse<PaymentResponseDto>> { }

@Get(':id')
@ApiGetPayment()
async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResponse<PaymentResponseDto>> { }

@Get()
@ApiListPayments()
async list(@Query() query: ListPaymentsQueryDto): Promise<ApiResponse<PaginatedPaymentsDto>> { }
```

If a module has multiple controllers, each gets its own `swagger/<controller-name>.swagger.ts` —
never share one swagger file across controllers, and never leave Swagger decorators inline once
the module has a `swagger/` folder.

## Response Format

Controllers don't build this shape by hand — call `ResponseUtil.success(data, message?)`
(`src/common/helpers/response.utils.ts`) and return its result; the `TransformInterceptor`
(global) fills in any field `ResponseUtil` didn't set, or wraps raw data the same way if a route
returns a plain value instead:

```json
{ "statusCode": 200, "status": "Success", "message": "Request successful", "data": { }, "error": null }
```

Type: `src/common/dto/api-response.ts`. A custom success message (e.g. "Payment refunded
successfully") is the second argument to `ResponseUtil.success(...)`, sourced from the shared
messages file — see "Messages" below — never an inline string.

## Error Responses

The `HttpExceptionFilter` (global) catches all exceptions:

```json
{ "statusCode": 404, "status": "Failure", "message": "Payment not found", "data": null, "error": "Not Found", "traceId": "uuid" }
```

Throw standard NestJS exceptions in services — with the message pulled from the shared messages
file, never inlined:

```ts
throw new NotFoundException(MESSAGES.PAYMENTS.NOT_FOUND);
throw new ForbiddenException(MESSAGES.COMMON.FORBIDDEN);
throw new BadRequestException(MESSAGES.PAYMENTS.INVALID_AMOUNT);
```

## Messages — single shared file, no inline strings

Every message above comes from `src/common/constants/messages.constants.ts` (create it the first
time a module needs it; see `module-structure.md`'s "Messages" section for the exact shape). Never
inline a user-facing string in a controller, service, or DB service — one file means one place to
check for wording consistency and one place to update for future i18n.

## DTO Patterns

Every `@ApiProperty()`/`@ApiPropertyOptional()` in every DTO carries an `example` — no exceptions,
including on `UpdateXDto`'s optional fields and `XResponseDto`'s output fields.

**CreateXDto** -- validation with `class-validator`:
```ts
export class CreatePaymentDto {
  @ApiProperty({ example: 2500 }) @IsNumber() @Min(1) amount!: number;
  @ApiProperty({ example: 'usd' }) @IsString() @IsNotEmpty() currency!: string;
}
```

**UpdateXDto** -- all fields `@IsOptional()`, still with examples:
```ts
export class UpdatePaymentDto {
  @ApiPropertyOptional({ example: 'refunded' }) @IsOptional() @IsString() status?: string;
}
```

**XResponseDto** -- output shape with static factory, every field has an example, and the factory
declares its return type explicitly:
```ts
export class PaymentResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-5e6f-7890-abcd-ef1234567890' }) id!: string;
  @ApiProperty({ example: 2500 }) amount!: number;

  static from(p: Payment): PaymentResponseDto {
    const dto = new PaymentResponseDto();
    Object.assign(dto, { id: p.id, amount: p.amount });
    return dto;
  }
}
```

Every method on every DTO, service, DB service, and repository declares an explicit return
type — never left to inference, never `any`. See `module-structure.md`'s closing note on why this
is what makes the layering (Controller → Service → DB Service → Repository) enforceable at
compile time rather than just a convention someone can quietly drift away from.

## Pagination Pattern

All list endpoints return `{ data: [], meta: { page, pageSize, total, totalPages } }`. Query
params are one DTO, not separate `@Query(...)` decorators, and `totalPages` is computed in the
service (or DB service), not the controller — a controller computing anything, `Math.ceil`
included, violates "controllers stay minimal," see `module-structure.md`:

```ts
// dto/list-payments-query.dto.ts
export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 }) @IsOptional() @Type(() => Number) @Min(1) page: number = 1;
  @ApiPropertyOptional({ example: 20, default: 20 }) @IsOptional() @Type(() => Number) @Min(1) pageSize: number = 20;
}

// dto/paginated-payments.dto.ts
export class PaginatedPaymentsDto {
  @ApiProperty({ type: [PaymentResponseDto] }) data!: PaymentResponseDto[];
  @ApiProperty({ example: { page: 1, pageSize: 20, total: 42, totalPages: 3 } }) meta!: PaginationMeta;

  static from(result: { data: Payment[]; total: number }, page: number, pageSize: number): PaginatedPaymentsDto {
    const dto = new PaginatedPaymentsDto();
    dto.data = result.data.map((item) => PaymentResponseDto.from(item));
    dto.meta = { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) };
    return dto;
  }
}

// payments.controller.ts
@Get()
@ApiListPayments()
async list(@CurrentUser() user: AuthUser, @Query() query: ListPaymentsQueryDto): Promise<ApiResponse<PaginatedPaymentsDto>> {
  const result = await this.paymentsService.findByUser(user.id, query.page, query.pageSize);
  return ResponseUtil.success(PaginatedPaymentsDto.from(result, query.page, query.pageSize));
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
