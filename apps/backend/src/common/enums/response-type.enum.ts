/** `review_responses.response_type`. `IMPORTED_REPLY` covers the backfill's historical replies —
 * neither an AI suggestion nor an escalation snippet; added to the DB enum for that reason. */
export enum ResponseType {
  AUTO_REPLY_SUGGESTION = 'auto_reply_suggestion',
  ESCALATION_SNIPPET = 'escalation_snippet',
  IMPORTED_REPLY = 'imported_reply',
}
