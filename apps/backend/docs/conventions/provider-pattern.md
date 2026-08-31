# Provider Pattern

How to create swappable service providers. All external integrations use this pattern so the implementation can be switched via configuration.

## Architecture

```
providers/
  storage.provider.ts      # abstract class (contract + DI token)
  s3.provider.ts           # concrete implementation A
  cloudinary.provider.ts   # concrete implementation B
```

## Step 1: Abstract Base Class

```ts
// providers/payment-gateway.provider.ts
@Injectable()
export abstract class PaymentGatewayProvider {
  abstract charge(options: { amount: number; currency: string; token: string }): Promise<{ transactionId: string; status: string }>;
  abstract refund(transactionId: string): Promise<void>;
}
```

## Step 2: Concrete Implementations

```ts
// providers/stripe.provider.ts
@Injectable()
export class StripeProvider extends PaymentGatewayProvider {
  private readonly logger = new Logger(StripeProvider.name);
  constructor(private readonly configService: ConfigService) { super(); }

  async charge(options) {
    this.logger.log(`Charging ${options.amount} via Stripe`);
    // Stripe SDK call
    return { transactionId: 'ch_xxx', status: 'completed' };
  }
  async refund(transactionId: string) { /* Stripe refund */ }
}

// providers/paypal.provider.ts
@Injectable()
export class PaypalProvider extends PaymentGatewayProvider {
  constructor(private readonly configService: ConfigService) { super(); }
  async charge(options) { return { transactionId: 'pp_xxx', status: 'completed' }; }
  async refund(transactionId: string) { /* PayPal refund */ }
}
```

## Step 3: Factory Provider in Module

```ts
{
  provide: PaymentGatewayProvider,
  useFactory: (configService: ConfigService): PaymentGatewayProvider => {
    const gateway = configService.get<string>('PAYMENT_GATEWAY') ?? 'stripe';
    logger.log(`Initializing payment gateway: ${gateway}`);
    switch (gateway) {
      case 'paypal': return new PaypalProvider(configService);
      case 'stripe': default: return new StripeProvider(configService);
    }
  },
  inject: [ConfigService],
}
```

Services inject the abstract class -- they never know which concrete is active:

```ts
constructor(private readonly gateway: PaymentGatewayProvider) {}
```

## Providers in This Codebase

### StorageProvider (Media)
- **Abstract**: `src/media/providers/storage.provider.ts`
- **Implementations**: S3 (`s3.provider.ts`), Cloudinary (`cloudinary.provider.ts`)
- **Config**: `STORAGE_PROVIDER` = `s3` | `cloudinary`
- **Methods**: `upload()`, `delete()`, `getSignedUrl()`

### EmailProvider (Email)
- **Abstract**: `src/email/providers/email.provider.ts`
- **Implementations**: SMTP (`smtp.provider.ts`), SES (`ses.provider.ts`)
- **Config**: `EMAIL_PROVIDER` = `smtp` | `ses`
- **Methods**: `send()`, `verify()`

### SmsProvider (SMS)
- **Abstract**: `src/sms/providers/sms.provider.ts`
- **Implementations**: Twilio (`twilio.provider.ts`), SNS (`sns.provider.ts`)
- **Config**: `SMS_PROVIDER` = `twilio` | `sns`
- **Methods**: `send()`, `checkDeliveryStatus()`

### AiProvider (AI)
- **Abstract**: `src/ai/providers/ai.provider.ts`
- **Implementations**: Claude (`claude.provider.ts`), OpenAI (`openai.provider.ts`)
- **Methods**: `chatCompletion()`, `embed()`, `name` (getter)

### PushProvider (Notifications)
- **Abstract**: `src/notifications/providers/push.provider.ts`
- **Implementation**: FCM (`fcm.provider.ts`)
- **Registered via**: `useClass` (single implementation)
- **Methods**: `sendToDevices()`, `sendToTopic()`

## Adding a New Provider

1. Create abstract class in `providers/` with the interface contract.
2. Create concrete implementations extending the abstract.
3. Add factory provider to the module's `providers` array.
4. Add env var to `.env.example`.
5. Inject the abstract class in your service -- never the concrete.

## Testing

Mock the abstract class directly -- tests are provider-agnostic:

```ts
{
  provide: PaymentGatewayProvider,
  useValue: {
    charge: jest.fn().mockResolvedValue({ transactionId: 'test-1', status: 'completed' }),
    refund: jest.fn().mockResolvedValue(undefined),
  },
}
```
