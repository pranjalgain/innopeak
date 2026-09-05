/**
 * The signed-in tenant owner. Hardcoded until real auth/session exists —
 * used anywhere the app needs to show or attribute the current user
 * (prompt versioning/tone, the sidebar/header account menus) so they can't
 * drift out of sync with each other.
 */
export const CURRENT_OWNER = {
  id: "owner_maria",
  name: "Maria Delgado",
  initials: "MD",
} as const;

/**
 * Mock stand-in for "this login belongs to a super admin" — there's no real
 * auth/session yet, so any login form that receives this exact email is
 * treated as the platform's super admin identity instead of a tenant owner.
 */
export const SUPER_ADMIN_EMAIL = "admin@innopeak.com";

export const CURRENT_SUPER_ADMIN = {
  id: "platform_admin_1",
  name: "InnoPeak Admin",
  initials: "IA",
} as const;
