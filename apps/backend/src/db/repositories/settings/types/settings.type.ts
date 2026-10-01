/** The raw `INSERT ... RETURNING` row shape for a blocklist term — snake_case, straight off the
 *  wire, before `BlocklistTermsRepository.insertTerm` maps it into the camelCase
 *  `BlocklistTermRecord` the rest of the app uses. */
export interface InsertedBlocklistTermRow {
  id: string;
  term: string;
  created_at: Date | string;
}
