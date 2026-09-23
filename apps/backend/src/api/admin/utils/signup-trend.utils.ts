import type { SignupTrendPoint } from '@db/repositories/admin-overview/admin-overview.repository';

/**
 * Fills every month in the trailing `monthsBack`-month window (counting back from the current UTC
 * month, inclusive) with a zero count where the repository returned none — it only returns months
 * that had at least one signup. Omitting zero-signup months would draw non-adjacent months as
 * adjacent equal-width bars on the frontend chart, implying an unbroken series and hiding a real
 * gap; this is what keeps the response itself the source of truth for "no signups that month"
 * rather than relying on the frontend to know the window's start/end.
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
