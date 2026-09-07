/** `users.status`. `pending_verification` is the only status a freshly-signed-up user starts in. */
export enum UserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  INVITED = 'invited',
  PENDING_VERIFICATION = 'pending_verification',
}
