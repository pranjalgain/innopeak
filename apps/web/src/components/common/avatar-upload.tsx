"use client";

import * as React from "react";
import { LuCamera } from "react-icons/lu";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface AvatarUploadProps {
  avatarUrl: string | null;
  initials: string;
  changeLabel: string;
  onUpload: (avatarUrl: string) => void;
}

/**
 * Profile-picture picker — a local `URL.createObjectURL` preview only, no
 * real upload endpoint yet (a real one would go through the backend's Media
 * module, which already exists for other uploads). Selecting a file just
 * replaces the avatar shown here immediately.
 */
export function AvatarUpload({ avatarUrl, initials, changeLabel, onUpload }: AvatarUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUpload(URL.createObjectURL(file));
    event.target.value = "";
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-accent text-lg font-medium text-accent-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <LuCamera />
          {changeLabel}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
    </div>
  );
}
