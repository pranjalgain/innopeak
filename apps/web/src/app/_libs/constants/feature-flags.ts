import { env } from "env";

/**
 * Tenant-facing feature toggles, separate from `AUTH_METHODS` — these gate
 * optional capabilities rather than login/signup methods, so QA can test
 * different configurations without a code change.
 */
export const FEATURE_FLAGS = {
  inviteMembers: env.NEXT_PUBLIC_INVITE_MEMBERS_ENABLED === "true",
} as const;
