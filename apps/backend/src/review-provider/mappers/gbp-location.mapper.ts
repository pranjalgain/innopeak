import { ProviderMappingError } from '../errors/provider.error';
import type { GbpAccount, GbpLocation, GbpPostalAddress } from '../types/gbp-wire.type';
import type { ProviderAccount, ProviderLocation } from '../types/review-provider.type';

/**
 * Google's structured address flattened to the single line `locations.address` holds.
 *
 * Returns null rather than "" for a service-area business, which genuinely has no storefront
 * address — the column is nullable precisely so that case is representable, and an empty string
 * would render as a blank line in the confirm-location card instead of being omitted.
 */
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

/** Treats a whitespace-only string as absent — Google sends `title: " "` more often than you'd hope. */
function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function mapGbpLocation(location: GbpLocation): ProviderLocation {
  if (!location.name) {
    throw new ProviderMappingError('Google location has no resource name');
  }

  return {
    // The full `locations/{id}` path, kept intact: it is what the reviews endpoint's URL is built
    // from, so storing a bare id would mean reassembling the path on every call.
    externalLocationId: location.name,
    // `locations.name` is NOT NULL. A location Google returns with no title — or with a title of
    // only whitespace — is a real (rare) case, so fall back to the resource path rather than
    // failing the whole discovery call or writing a blank name into the confirm-location card.
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
