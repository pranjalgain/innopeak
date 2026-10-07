import type { GbpListLocationsResponse, GbpLocation } from '../types/gbp-wire.type';

// The second entry gives the confirm-location picker's multi-result branch (and `alreadyConnected`) something to render.
export const MOCK_GBP_LOCATIONS: GbpLocation[] = [
  {
    name: 'locations/12345678901234567890',
    title: 'The Coastal Table',
    storefrontAddress: {
      regionCode: 'US',
      languageCode: 'en',
      postalCode: '04101',
      administrativeArea: 'ME',
      locality: 'Portland',
      addressLines: ['214 Harbor St'],
    },
    websiteUri: 'https://coastaltable.example.com',
  },
  {
    name: 'locations/98765432109876543210',
    title: 'The Coastal Table — Catering',
    // Service-area business with no storefrontAddress: `formatAddress` returns null, not "".
    websiteUri: 'https://coastaltable.example.com/catering',
  },
];

export function mockLocationsResponse(): GbpListLocationsResponse {
  return { locations: MOCK_GBP_LOCATIONS, totalSize: MOCK_GBP_LOCATIONS.length };
}
