/**
 * Fixed ids shared across every fixture/handler file, so a review can name its own recipient's
 * user id, a notification can name its review, an invite roster can name the root admin, etc.
 * without each domain guessing at another domain's ids.
 *
 * This whole directory exists only because this branch is a Vercel preview build with no backend
 * behind it — see `mock-backend/adapter.ts` for how it's wired in. Nothing here runs against a
 * real database; every "id" below is just a stable string two fixture files can agree on.
 */

export const DEMO_TENANT_ID = "tenant_coastal_table";
export const DEMO_LOCATION_ID = "location_coastal_table_downtown";
export const DEMO_CONNECTION_ID = "connection_coastal_table_google";

export const DEMO_OWNER_ID = "user_priya_ops";
export const DEMO_OWNER_EMAIL = "priya@thecoastaltable.com";
export const DEMO_OWNER_NAME = "Priya Ramaswamy";

export const DEMO_MEMBER_ID = "user_marcus_yee";
export const DEMO_MEMBER_EMAIL = "marcus@thecoastaltable.com";
export const DEMO_MEMBER_NAME = "Marcus Yee";

export const DEMO_BUSINESS_NAME = "The Coastal Table";

export const DEMO_ROOT_ADMIN_ID = "admin_root";
export const DEMO_ROOT_ADMIN_EMAIL = "admin@innopeak.com";

export const DEMO_SECOND_ADMIN_ID = "admin_dana";
export const DEMO_SECOND_ADMIN_EMAIL = "dana@innopeak.com";

/**
 * A second, suspended-business tenant — purely so the Super Admin businesses/users screens have
 * more than one row each, which is what actually exercises their filters and empty-state logic.
 */
export const DEMO_SECOND_TENANT_ID = "tenant_riverside_bistro";
export const DEMO_SECOND_TENANT_OWNER_ID = "user_owen_reyes";
export const DEMO_SECOND_TENANT_OWNER_EMAIL = "owen@riversidebistro.com";
export const DEMO_SECOND_TENANT_OWNER_NAME = "Owen Reyes";
export const DEMO_SECOND_BUSINESS_NAME = "Riverside Bistro";

/** Placeholder avatar handed back by a mocked confirm-avatar call — see `handlers/auth.ts`. */
export const MOCK_AVATAR_URL =
  "https://api.dicebear.com/9.x/notionists/svg?seed=innopeak-demo&backgroundColor=b6e3f4";
