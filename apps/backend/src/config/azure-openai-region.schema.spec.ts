import { validationSchema } from './env-config.schema';

function complainsAboutRegion(region: string): boolean {
  const { error } = validationSchema.validate(
    { AZURE_OPENAI_REGION: region },
    { abortEarly: false, allowUnknown: true }
  );
  return error?.details.some(detail => detail.path[0] === 'AZURE_OPENAI_REGION') ?? false;
}

describe('AZURE_OPENAI_REGION', () => {
  it.each(['westeurope', 'northeurope', ''])('accepts %p', region => {
    expect(complainsAboutRegion(region)).toBe(false);
  });

  // GDPR: reply generation stays inside the approved EU regions, so anything else fails at boot, not on the first generation.
  it.each(['eastus', 'swedencentral', 'NorthEurope'])('rejects %p', region => {
    expect(complainsAboutRegion(region)).toBe(true);
  });
});
