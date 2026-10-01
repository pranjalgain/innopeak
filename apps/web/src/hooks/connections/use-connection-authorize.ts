import { useState } from "react";

import { ConnectionService } from "@/app/_libs/services/connection.service";

interface UseConnectionAuthorizeResult {
  /** True from the moment `startAuthorize` is called until the browser actually leaves for
   *  Google — there is no "it failed" state to reset to, since a full-page navigation is what
   *  ends this either way. */
  isRedirecting: boolean;
  startAuthorize: (returnTo: "onboarding" | "settings") => void;
}

/**
 * The one thing every caller of `ConnectionService.startAuthorize` needs around it: a flag a
 * button can show a spinner/disabled state from while the redirect is in flight. Shared by
 * `ConnectionSettingsSection`'s "Connect" button and `ConnectionGuard`'s reconnect banner rather
 * than each component calling the service directly.
 */
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
