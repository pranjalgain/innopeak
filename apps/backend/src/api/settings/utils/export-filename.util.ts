/** Business name is reduced to ASCII `[a-z0-9-]` because it goes into `Content-Disposition`, where a quote, newline or non-ASCII character would break or inject into the header. */
export function buildExportFilename(businessName: string, now: Date): string {
  const slug = businessName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return `innopeak-export-${slug || 'business'}-${now.toISOString().slice(0, 10)}.json`;
}
