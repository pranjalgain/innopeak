import { useState } from "react";

import { ConnectionService } from "@/app/_libs/services/connection.service";

interface UseConnectionAuthorizeResult {
  /** True from `startAuthorize` until the browser leaves for Google; there is no failure state to reset to, since the navigation ends it either way. */
  isRedirecting: boolean;
  startAuthorize: (returnTo: "onboarding" | "settings") => void;
}

/** Shared spinner/disabled flag for `startAuthorize` callers (`ConnectionSettingsSection`, `ConnectionGuard`'s reconnect banner). */
export function useConnectionAuthorize(): UseConnectionAuthorizeResult {
  const [isRedirecting, setIsRedirecting] = useState(false);

  return {
    isRedirecting,
    startAuthorize: (returnTo) => {
      setIsRedirecting(true);
      void ConnectionService.startAuthorize(returnTo);
    },
  };
}
