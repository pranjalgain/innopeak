import { LuLockKeyhole } from "react-icons/lu";

import { AccessState } from "@/app/_components/access-state";

export default function ForbiddenPage() {
  return (
    <AccessState
      code="403"
      title="Forbidden"
      description="You are not authorized to access this resource."
      icon={LuLockKeyhole}
    />
  );
}
