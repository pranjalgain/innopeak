# Module Structure Convention

Standard anatomy for every feature module in this NestJS project.

## Directory Template

```
src/payments/                              # Business logic module
  dto/
    create-payment.dto.ts
    payment-response.dto.ts
  interfaces/
    payment.interface.ts
  providers/
    payment-gateway.provider.ts            # abstract
    stripe.provider.ts                     # concrete
  payments.controller.ts
  payments.service.ts
  payments.module.ts

src/db/repositories/payments/              # Data access (centralized)
  payments.repository.ts                   # Drizzle queries ONLY
```

> [!IMPORTANT]
> Repositories do NOT live inside the business module. They are centralized under
> `src/db/repositories/<domain>/` and registered in the global `DBModule`. This allows any module
> to inject any repository without cross-module coupling.

### Request Flow

```mermaid
flowchart LR
    Controller --> Service["Service (Facade)"]
    Service --> Repo[(Repository)]
    Service --> Provider["Provider\n(abstract + concrete)"]
    Repo --> DB[(PostgreSQL)]
```

## Module File

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
// NOTE: PaymentsRepository is NOT imported here — it is provided by the global DBModule
import { PaymentGatewayProvider } from './providers/payment-gateway.provider';
import { StripeProvider } from './providers/stripe.provider';
import { PaypalProvider } from './providers/paypal.provider';

@Module({
  // No need to import DBModule — it is @Global()
  controllers: [PaymentsController],
  providers: [
    // Repository is NOT registered here — DBModule provides it globally
    PaymentsService,
    {
      provide: PaymentGatewayProvider,
      useFactory: (config: ConfigService): PaymentGatewayProvider => {
        const gw = config.get<string>('PAYMENT_GATEWAY') ?? 'stripe';
        return gw === 'paypal' ? new PaypalProvider(config) : new StripeProvider(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
```

## Controller (versioned, Swagger, guards)

```ts
@Controller({ path: 'payments', version: '1' })
@ApiTags('Payments')
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a payment' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return PaymentResponseDto.from(await this.paymentsService.create(user.id, dto));
  }

  @Get()
  @ApiOperation({ summary: 'List payments' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    const result = await this.paymentsService.findByUser(user.id, page, pageSize);
    return {
      data: result.data.map((p) => PaymentResponseDto.from(p)),
      meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
    };
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Refund a payment (admin)' })
  async refund(@Param('id', ParseUUIDPipe) id: string) {
    await this.paymentsService.refund(id);
    return { message: 'Payment refunded successfully' };
  }
}
```

## Service (Facade pattern -- orchestrates repo + provider)

```ts
import { PaymentsRepository } from '@db/repositories/payments/payments.repository';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly repo: PaymentsRepository,  // Injected from global DBModule
    private readonly gateway: PaymentGatewayProvider,
  ) {}

  async create(userId: string, dto: CreatePaymentDto): Promise<Payment> {
    const result = await this.gateway.charge({ amount: dto.amount, currency: dto.currency, token: dto.paymentToken });
    return this.repo.create({ userId, amount: dto.amount, currency: dto.currency, gatewayId: result.transactionId, status: result.status });
  }

  async findById(id: string): Promise<Payment> {
    const payment = await this.repo.findById(id);
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async refund(id: string): Promise<void> {
    const payment = await this.findById(id);
    await this.gateway.refund(payment.gatewayId);
    await this.repo.updateStatus(id, 'refunded');
  }
}
```

## Repository (centralized under src/db/repositories/)

File: `src/db/repositories/payments/payments.repository.ts`

After creating the repository, register it in `src/db/db.module.ts`:
1. Import the repository class
2. Add it to the `repositories` array

```ts
// src/db/repositories/payments/payments.repository.ts
@Injectable()
export class PaymentsRepository {
  constructor(private readonly dbService: DBService) {}

  async create(data: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
    const rows = await this.dbService.db.insert(payments).values(data).returning();
    return rows[0]!;
  }

  async findById(id: string): Promise<Payment | null> {
    const rows = await this.dbService.db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByUserId(userId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const [totalResult, rows] = await Promise.all([
      this.dbService.db.select({ count: count() }).from(payments).where(eq(payments.userId, userId)),
      this.dbService.db.select().from(payments).where(eq(payments.userId, userId))
        .orderBy(desc(payments.createdAt)).limit(pageSize).offset(offset),
    ]);
    return { data: rows, total: totalResult[0]?.count ?? 0 };
  }
}
```

## DTO + Interface

```ts
// dto/create-payment.dto.ts
export class CreatePaymentDto {
  @ApiProperty({ example: 2500 }) @IsNumber() @Min(1) amount!: number;
  @ApiProperty({ example: 'usd' }) @IsString() @IsNotEmpty() currency!: string;
  @ApiProperty({ example: 'tok_visa' }) @IsString() @IsNotEmpty() paymentToken!: string;
}

// dto/payment-response.dto.ts
export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;

  static from(p: Payment): PaymentResponseDto {
    const dto = new PaymentResponseDto();
    Object.assign(dto, { id: p.id, amount: p.amount, status: p.status, createdAt: p.createdAt });
    return dto;
  }
}

// interfaces/payment.interface.ts
export interface Payment {
  id: string; userId: string; amount: number; currency: string;
  gatewayId: string; status: string; createdAt: Date;
}
```

## Wiring into the App

1. Add `PAYMENTS = 'payments'` to `src/common/route-names.ts`.
2. Create the repository in `src/db/repositories/payments/payments.repository.ts`.
3. Register the repository in `src/db/db.module.ts` (import + add to `repositories` array).
4. Import `PaymentsModule` in `app.module.ts`.
5. Create the migration (see `sql-first-workflow.md`).
6. Run `pnpm db:migrate` then `pnpm db:introspect` to update `src/db/drizzle/schema.ts`.
