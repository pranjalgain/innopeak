import { toLoggableError } from './loggable-error.util';

/** What `drizzle-orm` throws: the message carries the SQL and every bound value, the driver error is on `.cause`. */
function drizzleFailure(cause: Record<string, unknown>): Error {
  const error = new Error(
    'Failed query: select "id" from "users" where "email" = $1 and "password_hash" = $2\nparams: jane@example.com,$2b$12$secrethash'
  );
  error.name = 'DrizzleQueryError';
  (error as Error & { cause?: unknown }).cause = Object.assign(new Error('boom'), cause);
  (error as Error & { query?: string }).query = 'select ...';
  return error;
}

describe('toLoggableError', () => {
  it('drops the SQL and every bound value from a failed query', () => {
    const { message, stack } = toLoggableError(
      drizzleFailure({
        code: '23505',
        severity: 'ERROR',
        constraint: 'idx_users_email_active',
        table: 'users',
      })
    );

    expect(message).toBe('Database query failed (SQLSTATE 23505): idx_users_email_active, users');
    for (const text of [message, stack ?? '']) {
      expect(text).not.toContain('jane@example.com');
      expect(text).not.toContain('secrethash');
      expect(text).not.toContain('select');
    }
  });

  it("leaves out the driver's row detail, which quotes literal values", () => {
    const { message } = toLoggableError(
      drizzleFailure({
        code: '23505',
        severity: 'ERROR',
        detail: 'Key (email)=(jane@example.com) already exists.',
      })
    );

    expect(message).not.toContain('jane@example.com');
  });

  it('keeps the stack frames so the call site can still be found', () => {
    const { stack } = toLoggableError(drizzleFailure({ code: '40P01', severity: 'ERROR' }));

    expect(stack).toContain('Database query failed (SQLSTATE 40P01)');
    expect(stack).toMatch(/\n\s+at /);
    expect(stack).not.toContain('params:');
  });

  it('still reports a failed query whose cause is not a Postgres error (a dropped connection)', () => {
    const error = drizzleFailure({});
    const { message } = toLoggableError(error);

    expect(message).toBe('Database query failed');
  });

  it('recognises a bare driver error with no Drizzle wrapper', () => {
    const driverError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      severity: 'ERROR',
      detail: 'Key (email)=(jane@example.com) already exists.',
    });

    expect(toLoggableError(driverError).message).toBe('Database query failed (SQLSTATE 23505)');
  });

  it('passes an ordinary error through unchanged', () => {
    const error = new Error('Something else broke');

    expect(toLoggableError(error)).toEqual({ message: 'Something else broke', stack: error.stack });
  });

  it('handles a thrown string', () => {
    expect(toLoggableError('nope')).toEqual({ message: 'nope', stack: undefined });
  });
});
