/** Mirrors the web app's own `getInitials` (`apps/web/src/app/_libs/utils/initials.ts`) exactly —
 *  the Settings screen's recipient list needs the same derivation server-side, since
 *  `notification_recipients` has no `initials` column and never should: it's a display detail
 *  computed from `users.name`, not a fact worth storing redundantly. */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
