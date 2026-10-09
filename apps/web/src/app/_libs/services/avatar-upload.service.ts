import type { AvatarUploadAuthorizationResponseDto } from "@innopeak/client-sdk";

import { ApiError } from "@/app/_libs/services/api-error";

/** The provider itself refused the file (size cap, format, mid-upload failure), as opposed to our API's `ApiError`. */
export class AvatarUploadError extends Error {}

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

export class AvatarUploadService {
  /** Returns the id to confirm with the backend, which re-verifies it. */
  static async upload(
    file: File,
    authorization: AvatarUploadAuthorizationResponseDto,
  ): Promise<string> {
    // Fails oversized files fast; the authoritative cap is the one `verifyUpload` enforces.
    if (file.size > MAX_AVATAR_BYTES) {
      throw new AvatarUploadError("That image is too large. Please choose a file under 10 MB.");
    }

    return uploadToProvider(file, authorization);
  }

  /** Provider and backend-confirm (400) messages are worth showing verbatim; anything else falls back to the caller's generic copy. */
  static errorMessage(error: unknown, fallback: string): string {
    if (error instanceof AvatarUploadError) return error.message;
    if (error instanceof ApiError && error.statusCode === 400) return error.message;
    return fallback;
  }
}
