import { DEFAULT_ERASURE_GRACE_PERIOD_DAYS } from "@/app/_libs/constants/erasure";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

/** Days between a business being scheduled for erasure and its data being erased, as this deploy has it configured. */
export function useErasureGracePeriodDays(): number {
  const { data } = usePlatformSettings();
  return data?.erasureGracePeriodDays ?? DEFAULT_ERASURE_GRACE_PERIOD_DAYS;
}
