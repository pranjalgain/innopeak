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
  USERS: "/users",
  LOGIN: "/login",
  LOGIN_MICROSOFT: "/login/microsoft",
  ONBOARDING_SIGNUP: "/onboarding/signup",
  ONBOARDING_CONNECT: "/onboarding/connect",
  DASHBOARD: "/dashboard",
  REVIEW_QUEUE: "/review-queue",
  REVIEW_DETAIL: (id: string) => `/review-queue/${id}`,
  SETTINGS: "/settings",
  SETTINGS_PROMPTS: "/settings/prompts",
  ADMIN: "/admin",
  ADMIN_BUSINESSES: "/admin/businesses",
  ADMIN_USERS: "/admin/users",
  ADMIN_SETTINGS: "/admin/settings",
  ADMIN_BILLING: "/admin/billing",
} as const;

/**
 * External destinations referenced by the public UI.
 */
export const EXTERNAL_LINKS = {
  REPOSITORY: "https://git.geekyants.com/geekyants/coe-grp/boilerplates/frontend/nextjs",
  SENTRY_NEXTJS_DOCS: "https://docs.sentry.io/platforms/javascript/guides/nextjs/",
} as const;
