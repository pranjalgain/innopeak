import { env } from "env";

/** True in development and staging; gates debug logging that must not leak to production. */
export function isDevelopmentEnvironment() {
  if (env.NEXT_PUBLIC_APP_ENV === "development" || env.NEXT_PUBLIC_APP_ENV === "staging") {
    return true;
  }
  return false;
}
