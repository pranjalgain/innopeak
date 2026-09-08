/**
 * Which button started a Google round trip. Carried inside the signed `state` because the callback
 * is a single route and cannot otherwise tell them apart — and the difference is load-bearing:
 * only the signup path may create a tenant, and only it carries the business name needed to do so.
 *
 * A login-intent round trip that resolves to no known identity is therefore a dead end by design
 * (`NO_ACCOUNT`), not a silent signup with a fabricated business name.
 */
export enum OAuthIntent {
  LOGIN = 'login',
  SIGNUP = 'signup',
}
