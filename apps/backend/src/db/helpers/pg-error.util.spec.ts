import { isUniqueViolation } from './pg-error.util';

describe('isUniqueViolation', () => {
  const pgUnique = (constraint: string): Error =>
    Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint,
    });

  it('matches a bare pg DatabaseError', () => {
    expect(isUniqueViolation(pgUnique('idx_users_email_active'))).toBe(true);
  });

  it('matches when the pg error is wrapped as `.cause` by Drizzle', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: pgUnique('idx_users_email_active'),
    });

    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(wrapped, 'idx_users_email_active')).toBe(true);
  });

  it('respects the constraint filter', () => {
    expect(isUniqueViolation(pgUnique('idx_users_tenant_id_email'), 'idx_users_email_active')).toBe(
      false
    );
  });

  it('ignores other SQLSTATEs, plain errors, and non-objects', () => {
    expect(isUniqueViolation(Object.assign(new Error('fk'), { code: '23503' }))).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
