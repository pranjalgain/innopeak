# SQL-First Drizzle ORM Workflow

This project uses a SQL-first approach: you write raw SQL migrations, apply them, then introspect to generate the TypeScript schema.

## Quick Reference

| Command | Purpose |
|---|---|
| `pnpm db:create-migration <name>` | Scaffold a new migration file |
| `pnpm db:migrate` | Apply all pending migrations |
| `pnpm db:introspect` | Regenerate schema.ts from DB |
| `pnpm db:seed` | Run raw SQL seed files (roles, admin user) |
| `pnpm db:studio` | Open Drizzle Studio GUI |

### Pipeline

```mermaid
flowchart LR
    A["1. Create migration"] --> B["2. Write raw SQL"]
    B --> C["3. Apply migration"]
    C --> D["4. Introspect"]
    D --> E["5. Add relations"]
```

## Step 1: Create Migration

```bash
pnpm db:create-migration create_payments
```

This runs `scripts/create-migration.js` which:
- Creates `src/db/drizzle/migrations/XXXX_create_payments.sql` (auto-numbered from journal)
- Creates a snapshot file in `meta/`
- Updates `meta/_journal.json` with the new entry

## Step 2: Write Raw SQL

Edit the generated `.sql` file. Follow these conventions:

```sql
-- Migration: create_payments
-- Created at: 2026-02-21T00:00:00.000Z

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    gateway_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Always add indexes for foreign keys and frequent query columns
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- Use CHECK constraints for enum-like columns
ALTER TABLE payments ADD CONSTRAINT payment_status_check
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded'));
```

**SQL conventions used in this project:**
- UUIDs as primary keys with `gen_random_uuid()`
- `TIMESTAMPTZ` for all timestamps, `DEFAULT NOW()`
- `ON DELETE CASCADE` on foreign keys to user tables
- `JSONB` for flexible metadata columns
- Index naming: `idx_{table}_{column}`
- CHECK constraints for status/type columns

## Step 3: Apply Migration

```bash
pnpm db:migrate
```

This runs `src/db/drizzle/migrate.ts` which reads `DATABASE_URL` from `.env` and applies all pending migrations in order.

## Step 4: Introspect

```bash
pnpm db:introspect
```

This regenerates the Drizzle schema from the live database. After introspecting, **manually add relations** to `src/db/drizzle/schema.ts` because introspect does not generate them.

## Step 5: Add Relations to Schema

Open `src/db/drizzle/schema.ts` and add the table definition and relations:

```ts
// --- After the introspected table definition ---

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    amount: serial('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('usd'),
    gatewayId: varchar('gateway_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payments_user_id').on(table.userId),
    index('idx_payments_status').on(table.status),
    index('idx_payments_created_at').on(table.createdAt),
    check('payment_status_check', sql`${table.status} IN ('pending', 'completed', 'failed', 'refunded')`),
  ]
);

// Relations must be added manually
export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, { fields: [payments.userId], references: [users.id] }),
}));
```

## Key Files

| File | Purpose |
|---|---|
| `src/db/drizzle/schema.ts` | All table definitions and relations |
| `src/db/drizzle/migrations/*.sql` | Raw SQL migration files |
| `src/db/drizzle/migrations/meta/_journal.json` | Migration journal (auto-managed) |
| `src/db/drizzle/migrate.ts` | Migration runner script |
| `src/db/db.service.ts` | DB connection, exposes `db` property |
| `scripts/create-migration.js` | Migration scaffolding script |
| `drizzle.config.ts` | Drizzle Kit config for introspect/studio |

## DrizzleDB Type

Import the DB type from the service for use in repositories:

```ts
import { DBService } from '@db/db.service';
// Access: this.dbService.db
```

The type is `NodePgDatabase<typeof schema>`, exported as `DrizzleDB` from `db.service.ts`.

## Common Repository Query Patterns

**Select with join:**
```ts
const rows = await this.dbService.db
  .select({ id: payments.id, email: users.email })
  .from(payments)
  .leftJoin(users, eq(payments.userId, users.id))
  .where(eq(payments.status, 'completed'));
```

**Insert with returning:**
```ts
const [row] = await this.dbService.db
  .insert(payments)
  .values({ userId, amount, currency, gatewayId, status: 'pending' })
  .returning();
```

**Update:**
```ts
await this.dbService.db
  .update(payments)
  .set({ status: 'refunded', updatedAt: sql`now()` })
  .where(eq(payments.id, id));
```

**Delete:**
```ts
await this.dbService.db.delete(payments).where(eq(payments.id, id));
```

**Pagination with count:**
```ts
const offset = (page - 1) * pageSize;
const [totalResult, rows] = await Promise.all([
  this.dbService.db.select({ count: count() }).from(payments).where(eq(payments.userId, userId)),
  this.dbService.db.select().from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(pageSize).offset(offset),
]);
const total = totalResult[0]?.count ?? 0;
```
