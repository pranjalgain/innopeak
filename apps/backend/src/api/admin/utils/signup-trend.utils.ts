import type { SignupTrendPoint } from '@db/repositories/admin-overview/types/admin-overview.type';

/**
 * Zero-fills the trailing `monthsBack` UTC months (current inclusive) the repository omitted, so the
 * chart doesn't draw non-adjacent months as adjacent bars.
 */
export function fillSignupTrendWindow(
  points: SignupTrendPoint[],
  monthsBack: number
): SignupTrendPoint[] {
  const counts = new Map<string, number>();
  for (const point of points) {
    counts.set(`${point.year}-${point.month}`, point.count);
  }

  const now = new Date();
  const window: SignupTrendPoint[] = [];

  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    window.push({ year, month, count: counts.get(`${year}-${month}`) ?? 0 });
  }

  return window;
}
