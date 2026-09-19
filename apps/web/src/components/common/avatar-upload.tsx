"use client";

import { type ChangeEvent, useRef, useState } from "react";

import { LuCamera, LuLoaderCircle } from "react-icons/lu";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/** Mirrors the backend's own `FORMAT_TO_MIME_TYPE` allowlist (`CloudinaryStorageProvider`) —
 *  deliberately excludes `image/svg+xml` for the same reason: an SVG can carry a `<script>`, and
 *  this app renders the confirmed avatar URL directly in an `<img src>`. Keeping the two lists in
 *  sync just narrows the OS file picker's suggestions; the backend's own check is what's load-bearing. */
const ACCEPTED_AVATAR_TYPES =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,image/bmp";

interface AvatarUploadProps {
  avatarUrl: string | null;
  initials: string;
  changeLabel: string;
  /** Disables the picker and swaps the icon for a spinner while a previous selection is still uploading. */
  isUploading?: boolean;
  /** Runs the real direct-to-provider upload + confirm round trip — see `uploadAvatarFile`. */
  onUpload: (file: File) => Promise<void>;
}

/**
 * Profile-picture picker. Selecting a file shows an immediate local preview
 * (`URL.createObjectURL`) while `onUpload` uploads it for real in the background; the preview is
 * dropped once that settles, reverting to whatever `avatarUrl` then is — the confirmed new image on
 * success, or the unchanged previous one on failure.
 */
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
