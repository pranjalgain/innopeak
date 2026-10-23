/** A Postgres driver error as `pg` raises it: a five-character SQLSTATE and a severity. */
interface PgErrorLike {
  code?: unknown;
  severity?: unknown;
  constraint?: unknown;
  table?: unknown;
  column?: unknown;
}

/**
 * Drizzle's `DrizzleQueryError` has the message `Failed query: <sql>\nparams: <every bound value>`, and its stack begins with that
 * message. Bound values here are password and token hashes, emails and review text, so neither may reach a log line (or Loki). The driver
 * error is on `.cause`, one or two levels down.
 */
function findQueryFailure(error: unknown): { driver: PgErrorLike | undefined } | null {
  let current: unknown = error;
  let wrapped = false;
  let driver: PgErrorLike | undefined;
  for (let depth = 0; depth < 3 && current !== null && typeof current === 'object'; depth++) {
    const candidate = current as PgErrorLike & { query?: unknown; message?: unknown };
    if (
      typeof candidate.query === 'string' ||
      (typeof candidate.message === 'string' && candidate.message.startsWith('Failed query:'))
    ) {
      wrapped = true;
    }
    if (
      typeof candidate.code === 'string' &&
      candidate.code.length === 5 &&
      candidate.severity !== undefined
    ) {
      driver = candidate;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return wrapped || driver ? { driver } : null;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The message and stack to put in a log for `error`. A failed database statement is reduced to what an operator needs to find the
 * cause (SQLSTATE, constraint, table, column) with the SQL, its bound values and the driver's `detail` (`Key (email)=(a@b.com) already
 * exists`) left out; the stack keeps only its frames. Anything else passes through unchanged.
 */
export function toLoggableError(error: unknown): { message: string; stack: string | undefined } {
  const stack = error instanceof Error ? error.stack : undefined;
  const failure = findQueryFailure(error);
  if (!failure) {
    return { message: error instanceof Error ? error.message : String(error), stack };
  }

  const { driver } = failure;
  const where = [asText(driver?.constraint), asText(driver?.table), asText(driver?.column)]
    .filter((part): part is string => part !== undefined)
    .join(', ');
  const message = `Database query failed${asText(driver?.code) ? ` (SQLSTATE ${asText(driver?.code)})` : ''}${
    where ? `: ${where}` : ''
  }`;

  const frames = stack
    ?.split('\n')
    .filter(line => /^\s+at /.test(line))
    .join('\n');
  return { message, stack: frames ? `${message}\n${frames}` : undefined };
}
