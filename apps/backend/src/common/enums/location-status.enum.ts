/** `locations.status` — whether this location is still a valid, connected place to poll at all.
 * Independent of `last_sync_status`, which answers whether the most recent attempt succeeded. */
export enum LocationStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
