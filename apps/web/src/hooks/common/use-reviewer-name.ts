import { useTranslations } from "next-intl";

/** The name to show for a review's author: the services pass `null` for an anonymous or anonymized reviewer, and the label is the viewer's language. */
export function useReviewerName(): (name: string | null) => string {
  const t = useTranslations("common");
  return (name) => name ?? t("anonymousReviewer");
}
