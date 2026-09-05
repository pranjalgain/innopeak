import { env } from "env";

/**
 * Which login/signup methods render — env-gated so QA can test different
 * auth configurations without a code change. At least one should be `true`;
 * an all-`false` configuration is a misconfiguration, not something this
 * constant guards against.
 */
export const AUTH_METHODS = {
  sso: env.NEXT_PUBLIC_AUTH_SSO_ENABLED === "true",
  password: env.NEXT_PUBLIC_AUTH_PASSWORD_ENABLED === "true",
  social: env.NEXT_PUBLIC_AUTH_SOCIAL_ENABLED === "true",
} as const;
