/**
 * A platform admin's display name, derived from their email.
 *
 * `platform_admins` has no `name` column — an admin row is created by invite, which carries only an
 * email (see the backend's `AdminSettingsService.sendInvite`), so there is no name to read. Rather
 * than showing a raw address in the sidebar, the local part is split on the separators people
 * actually use in work addresses and title-cased: `priya.ops@innopeak.com` becomes "Priya Ops".
 *
 * This is presentation only. Anywhere identity has to be exact — the Profile tab, the activity
 * feed's actor — shows the real email instead.
 */
export function platformAdminDisplayName(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  // An address with no usable local part (`@innopeak.com`, or an empty string while the profile
  // query is still in flight) falls back to the email itself rather than rendering blank chrome.
  return words.length > 0 ? words.join(" ") : email;
}
