/**
 * The Azure regions an Azure OpenAI deployment may live in: GDPR keeps reply generation inside the EU. `westeurope` (Netherlands) was
 * the original requirement; `northeurope` (Ireland) was added when the client's resource was created there. A region is added only
 * with the client's agreement, never to make a misconfigured environment boot.
 */
export const ALLOWED_AZURE_OPENAI_REGIONS = ['westeurope', 'northeurope'] as const;

export type AzureOpenAiRegion = (typeof ALLOWED_AZURE_OPENAI_REGIONS)[number];

export function isAllowedAzureOpenAiRegion(
  region: string | undefined
): region is AzureOpenAiRegion {
  return ALLOWED_AZURE_OPENAI_REGIONS.some(allowed => allowed === region);
}
