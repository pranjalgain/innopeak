import { PgDialect } from 'drizzle-orm/pg-core';

import { businessSearchCondition } from './admin-businesses.repository';

/**
 * Renders the real SQL via `PgDialect` (the db-service spec mocks the repository). Guards: swapping the
 * correlation's literal `tenants.id` for an interpolated `${schema.tenants.id}` renders a wrong-table
 * column reference and silently breaks owner-name search.
 */
describe('businessSearchCondition', () => {
  const dialect = new PgDialect();

  it('correlates the owner EXISTS subquery against the outer tenants.id, unqualified', () => {
    const { sql } = dialect.sqlToQuery(businessSearchCondition('acme'));

    // Bare `tenants.id` on the right-hand side; an interpolated `${schema.tenants.id}` would render `"tenants"."id"` and resolve to the inner table.
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
    // `%`/`_` in the search term are escaped before wildcard wrapping; unescaped they would broaden the match.
    expect(params[0]).toBe('%50\\% off%');
    expect(params[0]).toBe(params[2]);
  });
});
