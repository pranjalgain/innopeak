import { useTranslations } from "next-intl";
import { LuShieldAlert } from "react-icons/lu";

import { AccessState } from "@/app/_components/access-state";

export default function UnauthorizedPage() {
  const t = useTranslations("accessState.unauthorized");

  return (
    <AccessState
      code="401"
      title={t("title")}
      description={t("description")}
      icon={LuShieldAlert}
    />
  );
}
