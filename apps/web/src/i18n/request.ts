import { getRequestConfig } from "next-intl/server";

/**
 * Single-locale setup for now (no `[locale]` route segment, no middleware) —
 * this is purely a string-extraction layer so UI copy lives in `messages/`
 * instead of hardcoded JSX. Add locale detection here if/when a second
 * locale is actually needed.
 */
export default getRequestConfig(async () => {
  return {
    locale: "en",
    messages: (await import("../../messages/en.json")).default,
  };
});
