/** A preference may ask for `both`, unlike `notification_channel`, because a delivery record names the one channel it went out on. */
export enum NotificationChannelPref {
  EMAIL = 'email',
  TEAMS = 'teams',
  BOTH = 'both',
}
