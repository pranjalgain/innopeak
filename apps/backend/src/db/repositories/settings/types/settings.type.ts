/** Raw snake_case `INSERT ... RETURNING` row, before `BlocklistTermsRepository.insertTerm` maps it to `BlocklistTermRecord`. */
export interface InsertedBlocklistTermRow {
  id: string;
  term: string;
  created_at: Date | string;
}
