/** Mirrors the web app's `getInitials`; derived server-side because `notification_recipients` deliberately has no `initials` column. */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
