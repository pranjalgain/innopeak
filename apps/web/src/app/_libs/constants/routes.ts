export const ROUTES = {
  HOME: "/",
  REFERENCE: "/reference",
  SENTRY_EXAMPLE: "/sentry-example-page",
  USERS: "/users",
  LOGIN: "/login",
  // Deliberately not /admin/login: a path under /admin/* could suggest it is inside the guarded
  // admin shell when it must be public.
  ADMIN_LOGIN: "/admin-login",
  ONBOARDING_SIGNUP: "/onboarding/signup",
  ONBOARDING_BUSINESS_NAME: "/onboarding/business-name",
  ONBOARDING_PLAN: "/onboarding/plan",
  ONBOARDING_CONNECT: "/onboarding/connect",
  DASHBOARD: "/dashboard",
  REVIEW_QUEUE: "/review-queue",
  REVIEW_DETAIL: (id: string) => `/review-queue/${id}`,
  SETTINGS: "/settings",
  SETTINGS_PROMPTS: "/settings/prompts",
  ADMIN: "/admin",
  ADMIN_BUSINESSES: "/admin/businesses",
  ADMIN_USERS: "/admin/users",
  ADMIN_BILLING: "/admin/billing",
  ADMIN_ACTIVITY: "/admin/activity",
  ADMIN_SETTINGS: "/admin/settings",
  FORBIDDEN: "/forbidden",
  UNAUTHORIZED: "/unauthorized",
} as const;

export const EXTERNAL_LINKS = {
  REPOSITORY: "https://git.geekyants.com/geekyants/coe-grp/boilerplates/frontend/nextjs",
  SENTRY_NEXTJS_DOCS: "https://docs.sentry.io/platforms/javascript/guides/nextjs/",
} as const;
