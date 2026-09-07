import type { GbpListLocationsResponse, GbpLocation } from '../types/gbp-wire.type';

/**
 * One location, because the MVP's one-active-location rule means anything more can't be confirmed
 * anyway. The second entry exists so the confirm-location picker's multi-result branch — and
 * `alreadyConnected` — have something real to render, and is a **service-area** business with no
 * `storefrontAddress`: the exact shape that makes `formatAddress` return null rather than "".
 */
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
    // No storefrontAddress at all: a service-area business. Exercises the null-address path.
    websiteUri: 'https://coastaltable.example.com/catering',
  },
];

export function mockLocationsResponse(): GbpListLocationsResponse {
  return { locations: MOCK_GBP_LOCATIONS, totalSize: MOCK_GBP_LOCATIONS.length };
}
