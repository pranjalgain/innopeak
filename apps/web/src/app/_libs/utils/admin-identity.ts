/**
 * `platform_admins` has no name column (invites carry only an email), so the display name is the
 * title-cased local part: `priya.ops@innopeak.com` becomes "Priya Ops". Presentation only; exact
 * identity (Profile tab, activity feed) shows the real email.
 */
export function platformAdminDisplayName(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  // No usable local part (or the profile query still in flight): fall back to the email, not blank chrome.
  return words.length > 0 ? words.join(" ") : email;
}
