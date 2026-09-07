/** `users.role` — a column, not an RBAC table. OR logic: `@Roles('owner','member')` matches either. */
export enum UserRole {
  OWNER = 'owner',
  MEMBER = 'member',
}
