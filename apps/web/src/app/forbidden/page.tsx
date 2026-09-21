import { useTranslations } from "next-intl";
import { LuLockKeyhole } from "react-icons/lu";

import { AccessState } from "@/app/_components/access-state";

export default function ForbiddenPage() {
  const t = useTranslations("accessState.forbidden");

  return (
    <AccessState
      code="403"
      title={t("title")}
      description={t("description")}
      icon={LuLockKeyhole}
    />
  );
}
