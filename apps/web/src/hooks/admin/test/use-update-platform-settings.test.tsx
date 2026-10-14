import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ApiError } from "@/app/_libs/services/api-error";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../messages/en.json";
import { useUpdatePlatformSettings } from "../use-update-platform-settings";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("useUpdatePlatformSettings", () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
  });

  // The backend refuses `notificationSettingsEnabled: true` with a 422 until email/Teams exist, and the message says why.
  test("shows the server's reason for a 422 instead of the generic failure", async () => {
    vi.spyOn(PlatformSettingsService, "update").mockRejectedValue(
      new ApiError(422, "Email and Teams notifications are not implemented yet."),
    );
    const { result } = renderHook(() => useUpdatePlatformSettings(), { wrapper });

    let saved = true;
    await act(async () => {
      saved = await result.current.update({ notificationSettingsEnabled: true });
    });

    expect(saved).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Email and Teams notifications are not implemented yet.");
  });

  test("keeps the generic message for any other failure", async () => {
    vi.spyOn(PlatformSettingsService, "update").mockRejectedValue(new ApiError(500, "boom"));
    const { result } = renderHook(() => useUpdatePlatformSettings(), { wrapper });

    await act(async () => {
      await result.current.update({ microsoftLoginEnabled: false });
    });

    expect(toast.error).toHaveBeenCalledWith(messages.adminSettings.platform.toasts.updateFailed);
  });

  // Switching Microsoft or Google off while some users can only sign in with it is a decision for the admin, not a failure.
  describe("when a change would lock users out", () => {
    const lockout = new ApiError(
      400,
      "Google is the only way 2 users can sign in. Turning it off locks them out until it is turned back on. Confirm to turn it off anyway.",
      "SSO_LOGIN_DISALLOWED_SSO_ONLY_USERS",
    );

    test("holds the change back and exposes the server's message instead of toasting an error", async () => {
      vi.spyOn(PlatformSettingsService, "update").mockRejectedValue(lockout);
      const { result } = renderHook(() => useUpdatePlatformSettings(), { wrapper });

      let saved = true;
      await act(async () => {
        saved = await result.current.update({ googleLoginEnabled: false });
      });

      expect(saved).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
      expect(result.current.pendingLockout).toEqual({ message: lockout.message });
    });

    test("confirming repeats the same change with the acknowledgement", async () => {
      const update = vi
        .spyOn(PlatformSettingsService, "update")
        .mockRejectedValueOnce(lockout)
        .mockResolvedValueOnce({ googleLoginEnabled: false } as never);
      const { result } = renderHook(() => useUpdatePlatformSettings(), { wrapper });
      await act(async () => {
        await result.current.update({ googleLoginEnabled: false });
      });

      let saved = false;
      await act(async () => {
        saved = await result.current.confirmLockout();
      });

      expect(saved).toBe(true);
      expect(update).toHaveBeenLastCalledWith({ googleLoginEnabled: false, confirmLockout: true });
      expect(result.current.pendingLockout).toBeNull();
      expect(toast.success).toHaveBeenCalled();
    });

    test("dismissing drops the held change without sending anything", async () => {
      const update = vi.spyOn(PlatformSettingsService, "update").mockRejectedValue(lockout);
      const { result } = renderHook(() => useUpdatePlatformSettings(), { wrapper });
      await act(async () => {
        await result.current.update({ googleLoginEnabled: false });
      });

      update.mockClear();
      act(() => result.current.dismissLockout());

      expect(result.current.pendingLockout).toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    test("does not ask again when the confirmed request is refused for the same reason", async () => {
      vi.spyOn(PlatformSettingsService, "update").mockRejectedValue(lockout);
      const { result } = renderHook(() => useUpdatePlatformSettings(), { wrapper });

      await act(async () => {
        await result.current.update({ googleLoginEnabled: false, confirmLockout: true });
      });

      expect(result.current.pendingLockout).toBeNull();
      expect(toast.error).toHaveBeenCalledWith(messages.adminSettings.platform.toasts.updateFailed);
    });
  });
});
