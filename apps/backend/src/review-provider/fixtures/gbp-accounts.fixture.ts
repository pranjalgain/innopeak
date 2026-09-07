import type { GbpAccount, GbpListAccountsResponse } from '../types/gbp-wire.type';

/**
 * The account the mock's consent resolves to. Its id is what lands in
 * `review_provider_connections.provider_account_id`, and so is what `ACCOUNT_MISMATCH` compares
 * against — `DEV_GBP_MOCK_ACCOUNT_ID` overrides it precisely so that branch can be exercised.
 *
 * Matches the fictional business used throughout `apps/backend/docs/dummy-data.json` and the
 * frontend fixtures, so a mocked backend and the mocked UI tell the same story.
 */
export const MOCK_GBP_ACCOUNT: GbpAccount = {
  name: 'accounts/108327761122',
  accountName: 'The Coastal Table',
  type: 'LOCATION_GROUP',
};

export function mockAccountsResponse(accountId?: string): GbpListAccountsResponse {
  return {
    accounts: [accountId ? { ...MOCK_GBP_ACCOUNT, name: accountId } : MOCK_GBP_ACCOUNT],
  };
}
