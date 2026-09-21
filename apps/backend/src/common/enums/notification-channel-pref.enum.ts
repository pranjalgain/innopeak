/** `notification_recipients.channel` — the recipient's own preference. Deliberately a different
 *  enum from `notification_channel` (`notifications.channel`, `email` | `teams`, no `both`): a
 *  preference can ask for both channels at once, but a single delivery record can only ever say
 *  which one channel it actually went out on. See the settings module's own docs for why the two
 *  value lists differ. */
export enum NotificationChannelPref {
  EMAIL = 'email',
  TEAMS = 'teams',
  BOTH = 'both',
}
