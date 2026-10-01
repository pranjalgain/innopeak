import { PgDialect } from 'drizzle-orm/pg-core';

import { businessSearchCondition } from './admin-businesses.repository';

/**
 * `businessSearchCondition` (and the `ownerPredicate()` it shares with `ownerName`/`ownerEmail`)
 * has no coverage anywhere else: `admin-businesses.db-service.spec.ts` mocks the repository
 * entirely, so it never executes this function's actual SQL-building code. These tests render the
 * real generated SQL via `PgDialect` (no live database needed — `.sqlToQuery` is a pure compile
 * step) specifically to catch the one regression this file's own comments warn is easy to
 * reintroduce silently: swapping the correlation's literal `tenants.id` for an interpolated
 * `${schema.tenants.id}`, which renders as a bare, wrong-table column reference and would make
 * every owner-name search silently return zero or wrong matches, with no compiler or runtime
 * error and no existing test to catch it.
 */
describe('businessSearchCondition', () => {
  const dialect = new PgDialect();

  it('correlates the owner EXISTS subquery against the outer tenants.id, unqualified', () => {
    const { sql } = dialect.sqlToQuery(businessSearchCondition('acme'));

    // The safe, correct form: a bare, unqualified `tenants.id` on the right-hand side — see
    // `ownerPredicate`'s own comment for why an interpolated `${schema.tenants.id}` here would
    // instead render as `"tenants"."id"` and resolve to the wrong (inner) table.
    expect(sql).toContain('"users"."tenant_id" = tenants.id');
    expect(sql).not.toContain('"tenants"."id"');
  });

  it('scopes the EXISTS subquery to non-anonymized owners only', () => {
    const { sql, params } = dialect.sqlToQuery(businessSearchCondition('acme'));

    expect(sql).toContain('"users"."role" = $2');
    expect(sql).toContain('"users"."anonymized_at" IS NULL');
    expect(params[1]).toBe('owner');
  });

  it('matches both the tenant name and the owner name against the same escaped %term% pattern', () => {
    const { sql, params } = dialect.sqlToQuery(businessSearchCondition('50% off'));

    expect(sql).toContain('"tenants"."name" ilike $1');
    expect(sql).toContain('"users"."name" ilike $3');
    // `%`/`_` in the caller's own search term must be escaped before the wildcard `%...%` wrapping
    // is added — an unescaped `%` here would turn a literal search into a broader wildcard match.
    expect(params[0]).toBe('%50\\% off%');
    expect(params[0]).toBe(params[2]);
  });
});
