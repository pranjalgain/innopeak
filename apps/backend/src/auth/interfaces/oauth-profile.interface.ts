/** Domain shape produced by an OAuth passport strategy's `validate()` and attached to `req.user`. */
export interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  accessToken?: string;
  refreshToken?: string;
}
