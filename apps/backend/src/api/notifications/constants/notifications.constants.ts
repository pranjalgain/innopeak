/** The popover renders a scroll container, not a numbered page list — the cap exists so a client
 *  can't request the whole feed history in one call. The frontend's own default (`PAGE_SIZE = 3`
 *  in `use-notifications.ts`) is independent of this and can be tuned without a backend change. */
export const NOTIFICATIONS_LIMIT_DEFAULT = 20;
export const NOTIFICATIONS_LIMIT_MAX = 50;

/** Upper bound on `offset`, so the value that reaches Postgres is always a sane bigint — see the
 *  query DTO's own comment. Deliberately far past any feed a person could scroll: this is a
 *  guard against absurd input, not a limit on how deep a real client may page. */
export const NOTIFICATIONS_OFFSET_MAX = 1_000_000;
