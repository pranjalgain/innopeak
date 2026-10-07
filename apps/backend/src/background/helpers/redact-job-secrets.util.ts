/** Payload keys that carry a live credential; redacted wherever present, whichever job produced it. */
const SECRET_JOB_FIELDS = ['otp', 'inviteLink', 'passwordResetLink', 'passwordSetLink'] as const;

/**
 * Redacts secrets before a payload is logged or persisted somewhere with longer retention than the queue
 * (the DLQ, `EmailProcessor`'s debug line); raw payload dumps leak live OTPs into log files and Loki.
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
