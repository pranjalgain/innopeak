"use client";

import { Button } from "@/components/ui/button";

import { MicrosoftLogo } from "@/assets/icons/microsoft-logo";

interface MicrosoftAuthButtonProps {
  isLoading: boolean;
  onClick: () => void;
  label: string;
}

/** "Continue with Microsoft": starts the real OAuth sign-in (the caller's `onClick`); the screen shows it only when the platform offers Microsoft. */
export function MicrosoftAuthButton({ isLoading, onClick, label }: MicrosoftAuthButtonProps) {
  return (
    <Button type="button" variant="outline" size="block" disabled={isLoading} onClick={onClick}>
      <MicrosoftLogo />
      {label}
    </Button>
  );
}