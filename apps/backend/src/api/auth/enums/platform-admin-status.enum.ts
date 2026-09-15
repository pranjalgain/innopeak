/** `platform_admins.status`. `invited` is the state before an admin has accepted their invite and set a password. */
export enum PlatformAdminStatus {
  INVITED = 'invited',
  ACTIVE = 'active',
  DISABLED = 'disabled',
}
