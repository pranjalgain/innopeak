# Testing Patterns

Four testing layers: Jest unit, Playwright (unit/functional/e2e), Artillery load.

## Commands

| Command | Runs |
|---|---|
| `pnpm test` | Jest unit (`*.spec.ts` in `src/`) |
| `pnpm test:e2e` | Playwright E2E (`tests/e2e/*.e2e.spec.ts`) |
| `pnpm test:playwright` | All Playwright tests |
| `pnpm test:playwright:unit` | Playwright `tests/unit/*.unit.spec.ts` |
| `pnpm test:playwright:functional` | Playwright `tests/functional/*.functional.spec.ts` |
| `pnpm test:playwright:e2e` | Playwright `tests/e2e/*.e2e.spec.ts` |
| `pnpm test:artillery` | Artillery load tests |

## Config Files

- `jest.config.ts` -- rootDir `src/`, pattern `*.spec.ts`, path alias mappers
- `jest.e2e.config.ts` -- legacy Jest e2e config (not used by `pnpm test:e2e`)
- `playwright.config.ts` -- testDir `./tests/`, three project configs
- `artillery/artillery.yml` -- load scenarios

## Unit Testing a Service (Jest)

Mock repository and providers. Test business logic only.

```ts
// src/payments/payments.service.spec.ts
describe('PaymentsService', () => {
  let service: PaymentsService;
  let repo: jest.Mocked<PaymentsRepository>;
  let gateway: jest.Mocked<PaymentGatewayProvider>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PaymentsRepository,
          useValue: { create: jest.fn(), findById: jest.fn(), updateStatus: jest.fn() },
        },
        {
          provide: PaymentGatewayProvider,
          useValue: { charge: jest.fn(), refund: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
    repo = module.get(PaymentsRepository);
    gateway = module.get(PaymentGatewayProvider);
  });

  it('should throw NotFoundException when payment missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });

  it('should charge gateway and persist', async () => {
    gateway.charge.mockResolvedValue({ transactionId: 'gw-1', status: 'completed' });
    repo.create.mockResolvedValue({ id: 'p-1' } as any);
    const result = await service.create('u-1', { amount: 100, currency: 'usd', paymentToken: 'tok' });
    expect(gateway.charge).toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ gatewayId: 'gw-1' }));
    expect(result.id).toBe('p-1');
  });
});
```

## Mocking Drizzle Repositories

Services never touch Drizzle directly. Mock the repository:

```ts
{ provide: UsersRepository, useValue: { findById: jest.fn(), findAll: jest.fn(), update: jest.fn() } }
```

To test a repository itself, mock `DBService`:

```ts
const mockDb = {
  select: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([{ id: '1' }]),
  insert: jest.fn().mockReturnThis(), values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockResolvedValue([{ id: '1' }]),
};
{ provide: DBService, useValue: { db: mockDb } }
```

## Testing Guards

```ts
describe('RolesGuard', () => {
  it('allows access with required role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['admin']) };
    const guard = new RolesGuard(reflector as any);
    const ctx = {
      getHandler: jest.fn(), getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: ['admin'] } }) }),
    };
    expect(guard.canActivate(ctx as any)).toBe(true);
  });
});
```

## Playwright Tests

Use fixtures from `tests/fixtures/api-fixtures.ts`:

```ts
// tests/unit/payments.unit.spec.ts
import { test, expect } from '../fixtures/api-fixtures';

test.describe('Payments API', () => {
  test('should return 401 without auth', async ({ api }) => {
    const { response } = await api.get('/v1/payments');
    expect(response.status()).toBe(401);
  });
});
```

Fixtures provide `api` (ApiHelpers), `healthCheck`, `metrics`. Extend for new modules.

## Artillery Load Tests

```yaml
# artillery/scenarios/payments.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 30
      arrivalRate: 10
scenarios:
  - name: 'Payment flow'
    flow:
      - post:
          url: '/v1/payments'
          headers:
            Authorization: 'Bearer {{ authToken }}'
          json:
            amount: 2500
            currency: 'usd'
```

Run: `pnpm test:artillery` or a specific scenario like `pnpm test:artillery:health`.

## Pre-Commit

Runs `type-check -> lint:check -> test`. All Jest unit tests must pass.
