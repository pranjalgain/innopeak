import type { AvatarUploadAuthorizationResponseDto } from "@innopeak/client-sdk";

import { ApiError } from "@/app/_libs/services/api-error";

/** `tooLarge`/`unsupportedType`: refused here, before anything is sent. `provider`: the provider itself refused it or could not be reached. */
export type AvatarUploadErrorKind = "provider" | "tooLarge" | "unsupportedType";

/** The file was refused (by us before sending, or by the provider), as opposed to our API's `ApiError`. */
export class AvatarUploadError extends Error {
  readonly kind: AvatarUploadErrorKind;

  constructor(message: string, kind: AvatarUploadErrorKind = "provider") {
    super(message);
    this.kind = kind;
  }
}

/**
 * Mirrors the backend's `FORMAT_TO_MIME_TYPE` allowlist, excluding `image/svg+xml` (an SVG can carry a `<script>` and the
 * avatar URL renders in an `<img>`). The authoritative check is the backend's; this one stops an obviously wrong file
 * before an upload is authorized and sent.
 */
export const ACCEPTED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/bmp",
] as const;

const ACCEPTED_AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif", "bmp"];

/** Mirrors the backend's `MAX_UPLOAD_BYTES` (enforced in `CloudinaryStorageProvider`); this copy only fails fast. */
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

interface CloudinaryUploadResponse {
  public_id?: string;
  error?: { message?: string };
}

/** Cloudinary answers JSON on success and rejection, but a proxy 502 or empty 413 is neither; parsing may fail without masking the status. */
async function readJsonBody(response: Response): Promise<CloudinaryUploadResponse | null> {
  try {
    return (await response.json()) as CloudinaryUploadResponse;
  } catch {
    return null;
  }
}

/** Sends `formFields` verbatim: the signature covers them, which is what keeps a client in its owner-scoped folder. */
async function uploadToProvider(
  file: File,
  authorization: AvatarUploadAuthorizationResponseDto,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  for (const [field, value] of Object.entries(authorization.formFields ?? {})) {
    formData.append(field, String(value));
  }

  let response: Response;
  try {
    response = await fetch(authorization.uploadUrl, { method: "POST", body: formData });
  } catch {
    throw new AvatarUploadError("Could not reach the image service. Check your connection.");
  }

  const body = await readJsonBody(response);

  if (!response.ok || !body?.public_id) {
    throw new AvatarUploadError(
      body?.error?.message ?? `Image upload failed (${String(response.status)}).`,
    );
  }
  return body.public_id;
}

/** Some browsers (HEIC on Windows) report an empty MIME type, so an unknown type falls back to the file extension. */
function isAcceptedType(file: File): boolean {
  if (file.type !== "") {
    return (ACCEPTED_AVATAR_MIME_TYPES as readonly string[]).includes(file.type);
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_AVATAR_EXTENSIONS.includes(extension);
}

/** What `errorMessage` shows, already translated by the caller; `fallback` covers everything not named here. */
export interface AvatarErrorMessages {
  fallback: string;
  tooLarge: string;
  unsupportedType: string;
}

export class AvatarUploadService {
  /**
   * Refuses a file that cannot be an avatar before an upload is authorized or sent: the wrong type would otherwise reach
   * the provider, which answers in its own words. Throws an `AvatarUploadError` with the reason as its `kind`.
   */
  static validate(file: File): void {
    if (!isAcceptedType(file)) {
      throw new AvatarUploadError("Unsupported image type.", "unsupportedType");
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new AvatarUploadError("Image too large.", "tooLarge");
    }
  }

  /** Returns the id to confirm with the backend, which re-verifies it. */
  static async upload(
    file: File,
    authorization: AvatarUploadAuthorizationResponseDto,
  ): Promise<string> {
    AvatarUploadService.validate(file);
    return uploadToProvider(file, authorization);
  }

  /**
   * Our own refusals are shown in the caller's language. A provider failure is not shown verbatim: its text is English and
   * written for developers ("Raw file format txt not allowed"), so it falls back to the caller's generic copy, as does
   * anything unexpected. A 400 from our own API is already localized by the server and is shown as is.
   */
  static errorMessage(error: unknown, messages: AvatarErrorMessages): string {
    if (error instanceof AvatarUploadError) {
      if (error.kind === "tooLarge") return messages.tooLarge;
      if (error.kind === "unsupportedType") return messages.unsupportedType;
      return messages.fallback;
    }
    if (error instanceof ApiError && error.statusCode === 400) return error.message;
    return messages.fallback;
  }
}
