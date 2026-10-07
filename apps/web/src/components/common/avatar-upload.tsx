"use client";

import { type ChangeEvent, useRef, useState } from "react";

import { LuCamera, LuLoaderCircle } from "react-icons/lu";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/** Mirrors the backend's `FORMAT_TO_MIME_TYPE` allowlist, excluding `image/svg+xml` (an SVG can carry
 *  a `<script>` and the avatar URL renders in an `<img>`). Only narrows the picker; the backend check is what's load-bearing. */
const ACCEPTED_AVATAR_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,image/bmp";

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
