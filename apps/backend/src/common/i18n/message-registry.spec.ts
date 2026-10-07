import { MESSAGES, renderMessage, renderNestedMessage } from './message-registry';
import { messagesDe } from './messages.de';
import { messagesEn } from './messages.en';

describe('MESSAGES / renderMessage', () => {
  it('MESSAGES leaves are strings/functions, not the rendered English text', () => {
    expect(typeof MESSAGES.AUTH.INVALID_CREDENTIALS).toBe('string');
    expect(MESSAGES.AUTH.INVALID_CREDENTIALS).not.toBe(messagesEn.AUTH.INVALID_CREDENTIALS);
    expect(typeof MESSAGES.PROMPTS.UNKNOWN_VARIABLE).toBe('function');
  });

  it('renders a plain (non-interpolating) key to the resolved locale', () => {
    expect(renderMessage(MESSAGES.AUTH.INVALID_CREDENTIALS, 'en')).toBe(
      messagesEn.AUTH.INVALID_CREDENTIALS
    );
    expect(renderMessage(MESSAGES.AUTH.INVALID_CREDENTIALS, 'de')).toBe(
      messagesDe.AUTH.INVALID_CREDENTIALS
    );
  });

  it('renders an interpolating key, preserving the call-time argument, in both locales', () => {
    const tagged = MESSAGES.AUTH.SIGNUP_OTP_SENT('owner@example.com');

    expect(renderMessage(tagged, 'en')).toBe(messagesEn.AUTH.SIGNUP_OTP_SENT('owner@example.com'));
    expect(renderMessage(tagged, 'de')).toBe(messagesDe.AUTH.SIGNUP_OTP_SENT('owner@example.com'));
    expect(renderMessage(tagged, 'de')).not.toBe(renderMessage(tagged, 'en'));
  });

  it('renders an interpolating key that takes an array argument correctly', () => {
    const tagged = MESSAGES.PROMPTS.UNKNOWN_VARIABLE(['reviewer_name', 'rating']);

    expect(renderMessage(tagged, 'en')).toBe(
      messagesEn.PROMPTS.UNKNOWN_VARIABLE(['reviewer_name', 'rating'])
    );
    expect(renderMessage(tagged, 'de')).toBe(
      messagesDe.PROMPTS.UNKNOWN_VARIABLE(['reviewer_name', 'rating'])
    );
  });

  it('passes through any string that never went through MESSAGES, unchanged', () => {
    // class-validator, Postgres and third-party text must never be mangled.
    const ordinaryValidationMessage = 'escalationRatingThreshold must not be less than 1';
    expect(renderMessage(ordinaryValidationMessage, 'de')).toBe(ordinaryValidationMessage);
    expect(renderMessage('', 'de')).toBe('');
  });

  it('falls back to the raw tag rather than throwing on an unrecognized key path', () => {
    const realTag = MESSAGES.AUTH.INVALID_CREDENTIALS;
    const malformedTag = realTag.replace('AUTH.INVALID_CREDENTIALS', 'AUTH.NOT_A_REAL_KEY');

    expect(() => renderMessage(malformedTag, 'en')).not.toThrow();
    expect(renderMessage(malformedTag, 'en')).toBe(malformedTag);
  });

  // `@Catch()` receives anything thrown; a throw here would yield a raw HTML 500 with no envelope or traceId.
  it('never throws on a non-string input, converting instead of crashing', () => {
    expect(renderMessage(undefined, 'en')).toBe('');
    expect(renderMessage(null, 'en')).toBe('');
    expect(renderMessage(42, 'en')).toBe('42');
  });

  // An inherited member like `constructor` is neither a string nor safe to call with attacker-controlled JSON args.
  it('does not resolve a path segment to an inherited Object.prototype member', () => {
    const NUL = String.fromCharCode(0);
    expect(renderMessage(`${NUL}i18n${NUL}constructor${NUL}[1]`, 'de')).toBe(
      `${NUL}i18n${NUL}constructor${NUL}[1]`
    );
    expect(renderMessage(`${NUL}i18n${NUL}toString`, 'de')).toBe(`${NUL}i18n${NUL}toString`);
  });

  it('falls back to the raw tag rather than throwing on malformed interpolation args', () => {
    const NUL = String.fromCharCode(0);
    // Unparseable JSON.
    const badJson = `${NUL}i18n${NUL}AUTH.SIGNUP_OTP_SENT${NUL}{notjson`;
    expect(() => renderMessage(badJson, 'en')).not.toThrow();
    expect(renderMessage(badJson, 'en')).toBe(badJson);

    // Valid JSON of the wrong shape throws inside the catalog function itself.
    const wrongArgType = `${NUL}i18n${NUL}PROMPTS.UNKNOWN_VARIABLE${NUL}[123]`;
    expect(() => renderMessage(wrongArgType, 'en')).not.toThrow();
    expect(renderMessage(wrongArgType, 'en')).toBe(wrongArgType);
  });

  // Regression: a German response rendered the envelope `message` but left a raw tag in `data.message`.
  describe('renderNestedMessage', () => {
    it('renders a message field nested inside data, alongside the envelope message', () => {
      const data = { message: MESSAGES.AUTH.RESEND_OTP_ACK };

      expect(renderNestedMessage(data, 'de')).toEqual({
        message: messagesDe.AUTH.RESEND_OTP_ACK,
      });
      expect(renderNestedMessage(data, 'en')).toEqual({
        message: messagesEn.AUTH.RESEND_OTP_ACK,
      });
    });

    it('leaves every other field on data untouched', () => {
      const data = { id: '123', message: MESSAGES.SETTINGS.BLOCKLIST_TERM_CREATED, extra: [1, 2] };

      expect(renderNestedMessage(data, 'de')).toEqual({
        id: '123',
        message: messagesDe.SETTINGS.BLOCKLIST_TERM_CREATED,
        extra: [1, 2],
      });
    });

    it('passes through data with no message field, an array, null, or a primitive unchanged', () => {
      expect(renderNestedMessage({ id: '123' }, 'de')).toEqual({ id: '123' });
      expect(renderNestedMessage([1, 2, 3], 'de')).toEqual([1, 2, 3]);
      expect(renderNestedMessage(null, 'de')).toBeNull();
      expect(renderNestedMessage('a plain string payload', 'de')).toBe('a plain string payload');
    });
  });

  // A translator working key-by-key can't know these are deliberately identical to avoid an enumeration oracle.
  describe('anti-enumeration parity', () => {
    it('keeps SIGNUP_OTP_SENT and LOGIN_OTP_SENT identical in German, as they are in English', () => {
      const email = 'owner@example.com';
      expect(messagesEn.AUTH.SIGNUP_OTP_SENT(email)).toBe(messagesEn.AUTH.LOGIN_OTP_SENT(email));
      expect(messagesDe.AUTH.SIGNUP_OTP_SENT(email)).toBe(messagesDe.AUTH.LOGIN_OTP_SENT(email));
    });
  });

  /**
   * `MessageCatalog` already makes a missing/extra German key a compile error — this is a
   * runtime double-check of the same property, cheap to keep and independent of the type system
   * (a `@ts-expect-error` slipped in above a key, or a future refactor that loosens the
   * interface, would not be caught by the compiler alone).
   */
  it('messagesDe has exactly the same key structure as messagesEn', () => {
    expect(collectPaths(messagesDe)).toEqual(collectPaths(messagesEn));
  });
});

function collectPaths(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) {
    return [prefix];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    collectPaths(value, prefix ? `${prefix}.${key}` : key)
  );
}
