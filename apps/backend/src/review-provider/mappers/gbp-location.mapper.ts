import { ProviderMappingError } from '../errors/provider.error';
import type { GbpAccount, GbpLocation, GbpPostalAddress } from '../types/gbp-wire.type';
import type { ProviderAccount, ProviderLocation } from '../types/review-provider.type';

// null, not "", for a service-area business: no storefront address, and "" would render a blank line.
function formatAddress(address: GbpPostalAddress | undefined): string | null {
  if (!address) {
    return null;
  }

  const parts = [
    ...(address.addressLines ?? []),
    address.locality,
    address.administrativeArea,
    address.postalCode,
  ].filter((part): part is string => Boolean(part?.trim()));

  return parts.length > 0 ? parts.join(', ') : null;
}

// Google sends `title: " "` more often than you'd hope.
function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function mapGbpLocation(location: GbpLocation): ProviderLocation {
  if (!location.name) {
    throw new ProviderMappingError('Google location has no resource name');
  }

  return {
    // Full `locations/{id}` path: the reviews endpoint URL is built from it.
    externalLocationId: location.name,
    // `locations.name` is NOT NULL and Google can return no/blank title, so fall back to the resource path.
    name: nonEmpty(location.title) ?? location.name,
    address: formatAddress(location.storefrontAddress),
  };
}

export function mapGbpAccount(account: GbpAccount): ProviderAccount {
  if (!account.name) {
    throw new ProviderMappingError('Google account has no resource name');
  }

  return {
    externalAccountId: account.name,
    ...(account.accountName ? { name: account.accountName } : {}),
  };
}
