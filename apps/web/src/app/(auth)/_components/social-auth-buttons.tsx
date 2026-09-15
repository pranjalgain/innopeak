"use client";

import { FcGoogle } from "react-icons/fc";

import { Button } from "@/components/ui/button";

interface SocialAuthButtonsProps {
  isLoading: boolean;
  onGoogleClick: () => void;
  label: string;
}

/**
 * Mock social sign-in — gated behind the platform's socialLoginEnabled setting, off by default.
 * No email is collected here, so a social login always resolves to a tenant
 * identity, never the super-admin mock (see `AuthService`).
 */
export function SocialAuthButtons({ isLoading, onGoogleClick, label }: SocialAuthButtonsProps) {
  return (
    <Button type="button" variant="outline" size="block" disabled={isLoading} onClick={onGoogleClick}>
      <FcGoogle />
      {label}
    </Button>
  );
}
