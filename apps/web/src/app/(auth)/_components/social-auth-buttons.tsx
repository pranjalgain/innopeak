"use client";

import { FcGoogle } from "react-icons/fc";

import { Button } from "@/components/ui/button";

interface SocialAuthButtonsProps {
  isLoading: boolean;
  onGoogleClick: () => void;
  label: string;
}

/** "Continue with Google": starts the real OAuth sign-in (the caller's `onGoogleClick`); the screen shows it only when the platform's `googleLoginEnabled` is on. */
export function SocialAuthButtons({ isLoading, onGoogleClick, label }: SocialAuthButtonsProps) {
  return (
    <Button type="button" variant="outline" size="block" disabled={isLoading} onClick={onGoogleClick}>
      <FcGoogle />
      {label}
    </Button>
  );
}
