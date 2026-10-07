import type { GbpAccount, GbpListAccountsResponse } from '../types/gbp-wire.type';

// Its id is what `ACCOUNT_MISMATCH` compares against; `DEV_GBP_MOCK_ACCOUNT_ID` overrides it to exercise that branch.
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
