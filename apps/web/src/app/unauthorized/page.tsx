import { LuShieldAlert } from "react-icons/lu";

import { AccessState } from "@/app/_components/access-state";

export default function UnauthorizedPage() {
  return (
    <AccessState
      code="401"
      title="Unauthorized"
      description="You are not authorized to access this resource or this page."
      icon={LuShieldAlert}
    />
  );
}
