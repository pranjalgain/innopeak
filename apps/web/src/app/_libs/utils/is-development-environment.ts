import { env } from "env";

/**
 * @description: Utility to do console logs for testing purpose in the staging that shouldn't leak to the production but allows the QA Team to debug or validate values faster.
 * @returns boolean
 */
export function isDevelopmentEnvironment() {
  if (env.NEXT_PUBLIC_APP_ENV === "development" || env.NEXT_PUBLIC_APP_ENV === "staging") {
    return true;
  }
  return false;
}
