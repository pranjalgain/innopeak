import type { AvatarUploadAuthorizationResponseDto } from "@innopeak/client-sdk";

import { ApiError } from "@/app/_libs/services/api-error";

/**
 * Thrown when the provider itself refuses the file — a size cap, a rejected format, a network
 * failure mid-upload. Distinct from the backend's own `ApiError` so callers can tell "your file is
 * the problem" (worth repeating to the user verbatim) from "our API is the problem".
 */
export class AvatarUploadError extends Error {}

/** Mirrors the backend's own `MAX_UPLOAD_BYTES` (`CloudinaryStorageProvider`), which is where the
 *  cap is actually enforced — this copy only exists to fail fast before spending the upload. */
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

interface CloudinaryUploadResponse {
  public_id?: string;
  error?: { message?: string };
}

/** Cloudinary answers JSON on success *and* on a rejected upload, but a proxy 502 or an empty 413
 *  is neither — parsing has to be allowed to fail without masking the status we already have. */
async function readJsonBody(response: Response): Promise<CloudinaryUploadResponse | null> {
  try {
    return (await response.json()) as CloudinaryUploadResponse;
  } catch {
    return null;
  }
}

/**
 * Uploads straight to the provider with the fields the backend signed — the file never touches our
 * own API. Everything in `formFields` is sent verbatim: the signature covers those values, so
 * editing or dropping one makes the provider reject the upload (which is exactly what stops a
 * client uploading outside its own owner-scoped folder).
 */
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

/**
 * The direct-to-provider half of the avatar upload flow. Returns the id the caller then hands to
 * the backend's confirm route — which re-verifies it against the provider rather than trusting it,
 * so a wrong id here fails there rather than persisting something bogus.
 *
 * An empty `uploadUrl` means the offline `noop` provider: there is nothing to upload to, so the
 * sentinel id it already handed us is what gets confirmed.
 */
export async function uploadAvatarFile(
  file: File,
  authorization: AvatarUploadAuthorizationResponseDto,
): Promise<string> {
  // Checked here purely so an oversized file fails instantly instead of after a slow upload the
  // backend would reject anyway — the authoritative cap is the one `verifyUpload` enforces, since
  // nothing client-side is trustworthy.
  if (file.size > MAX_AVATAR_BYTES) {
    throw new AvatarUploadError("That image is too large. Please choose a file under 10 MB.");
  }

  if (!authorization.uploadUrl) {
    if (!authorization.providerAssetId) {
      throw new AvatarUploadError("The image service is not configured.");
    }
    return authorization.providerAssetId;
  }

  return uploadToProvider(file, authorization);
}

/**
 * What to actually show the user when an avatar upload fails. Both failure sources carry a message
 * worth repeating verbatim — the provider's ("File size too large") tells them to pick a different
 * file, and the backend's 400 from confirm is already localized ("This image format is not
 * supported…"). Everything else is a server or transport fault the user can do nothing about, so
 * it falls back to the caller's generic copy.
 */
export function avatarUploadErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AvatarUploadError) return error.message;
  if (error instanceof ApiError && error.statusCode === 400) return error.message;
  return fallback;
}
