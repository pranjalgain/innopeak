export interface AuthorizeResult {
  authorizationUrl: string;
  /** Set as the browser-binding cookie by the controller. */
  sid: string;
}

export interface CallbackInput {
  code?: string | undefined;
  state?: string | undefined;
  error?: string | undefined;
  sid?: string | undefined;
}
