/** Field names on any job payload that carry a live, usable credential — never logged or
 *  persisted in the clear. Structural, not job-specific: any payload carrying one of these keys
 *  gets it redacted, regardless of which job produced it. */
const SECRET_JOB_FIELDS = ['otp', 'inviteLink', 'passwordResetLink', 'passwordSetLink'] as const;

/**
 * Redacts known-secret fields from a job payload before it is logged or persisted anywhere with
 * longer retention/less protection than the queue itself — the DLQ (days-long retention) and
 * `EmailProcessor`'s own debug line, which otherwise `JSON.stringify(job.data)`s the payload
 * whole. See `queue-add-manager.ts`'s own comment: this exact shape (a debug-enabled environment
 * dumping the raw payload) previously leaked live OTPs into log files and Loki.
 */
export function redactJobSecrets(jobData: unknown): unknown {
  if (typeof jobData !== 'object' || jobData === null) {
    return jobData;
  }

  const redacted: Record<string, unknown> = { ...(jobData as Record<string, unknown>) };
  for (const field of SECRET_JOB_FIELDS) {
    if (typeof redacted[field] === 'string') {
      redacted[field] = '[redacted]';
    }
  }
  return redacted;
}
