/**
 * Every user-facing string (exception messages, custom success messages passed to
 * ResponseUtil.success) lives here — see apps/backend/docs/conventions/module-structure.md.
 * Never an inline literal in a controller, service, or DB service.
 *
 * `MESSAGES` itself is re-exported from `@common/i18n/message-registry` — the English/German
 * content now lives in `@common/i18n/messages.en.ts` / `messages.de.ts`, and what
 * `MESSAGES.AUTH.INVALID_CREDENTIALS` etc. actually holds is a locale-agnostic key, not rendered
 * English text; `TransformInterceptor` and `HttpExceptionFilter` resolve it to the request's
 * locale right before the response is sent. This file keeps the same import path
 * (`@common/constants/messages.constants`) so no existing call site needs to change.
 */
export { MESSAGES } from '@common/i18n/message-registry';
