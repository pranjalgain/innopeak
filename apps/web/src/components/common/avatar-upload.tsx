"use client";

import { type ChangeEvent, useRef, useState } from "react";

import { LuCamera, LuLoaderCircle } from "react-icons/lu";

import { ACCEPTED_AVATAR_MIME_TYPES } from "@/app/_libs/services/avatar-upload.service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/** Only narrows the picker; `AvatarUploadService.validate` and then the backend are what refuse a wrong file. */
const ACCEPTED_AVATAR_TYPES = ACCEPTED_AVATAR_MIME_TYPES.join(",");

interface AvatarUploadProps {
  avatarUrl: string | null;
  initials: string;
  changeLabel: string;
  isUploading?: boolean;
  onUpload: (file: File) => Promise<void>;
}

export function AvatarUpload({
  avatarUrl,
  initials,
  changeLabel,
  isUploading = false,
  onUpload,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    try {
      await onUpload(file);
    } finally {
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
    }
  };

  const displayUrl = previewUrl ?? avatarUrl;

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {displayUrl ? <AvatarImage src={displayUrl} alt="" /> : null}
        <AvatarFallback className="bg-accent text-accent-foreground text-lg font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? <LuLoaderCircle className="animate-spin" /> : <LuCamera />}
          {changeLabel}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_AVATAR_TYPES}
          className="hidden"
          onChange={(event) => void handleFileChange(event)}
        />
      </div>
    </div>
  );
}
