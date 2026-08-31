/**
 * This file contains all the routes that are used in the application.
 */

/**
 * @description Routes
 * @returns {Record<string, string>} Routes
 */
export const ROUTES = {
  HOME: "/",
  REFERENCE: "/reference",
  SENTRY_EXAMPLE: "/sentry-example-page",
  SHOWCASE: "/showcase",
  USERS: "/users",
} as const;

/**
 * External destinations referenced by the public UI.
 */
export const EXTERNAL_LINKS = {
  REPOSITORY: "https://git.geekyants.com/geekyants/coe-grp/boilerplates/frontend/nextjs",
  SENTRY_NEXTJS_DOCS: "https://docs.sentry.io/platforms/javascript/guides/nextjs/",
} as const;
