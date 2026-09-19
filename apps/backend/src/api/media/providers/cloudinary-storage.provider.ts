import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

import { StorageProvider } from './storage.provider';

import type {
  CreateUploadAuthorizationInput,
  UploadAuthorization,
  VerifyUploadResult,
} from '../types/storage-provider.type';

/**
 * Cloudinary's own `format` (a bare extension, e.g. `"jpg"`) isn't a MIME type — this maps the
 * formats a real-world avatar upload can plausibly arrive as (a phone's default camera format
 * included — `heic`/`heif` on iOS, `avif` increasingly elsewhere) to the MIME type this app
 * actually persists. Deliberately excludes `svg`: unlike every format here, an SVG's "image" can
 * carry a `<script>`, and this app renders `media.url` directly in an `<img src>` with no
 * sanitization step — treating it as an accepted avatar format would be a stored-XSS vector, not
 * just an unsupported one.
 */
const FORMAT_TO_MIME_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
};

/**
 * Signed alongside `folder`/`timestamp` so Cloudinary itself rejects an oversized or wrong-format
 * upload at the door, instead of us discovering it one round trip later at confirm — and, more to
 * the point, instead of the asset being stored at all. An authorization is handed to the browser,
 * so every constraint that isn't in the signature is a constraint the client can simply drop.
 *
 * `allowed_formats` mirrors `FORMAT_TO_MIME_TYPE`'s keys: anything `verifyUpload` would refuse to
 * persist should never have been accepted in the first place. 10 MB is generous for an avatar
 * while still bounding what a single signature can push into the account.
 */
const ALLOWED_UPLOAD_FORMATS = Object.keys(FORMAT_TO_MIME_TYPE).join(',');
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Injectable()
export class CloudinaryStorageProvider extends StorageProvider {
  readonly type = 'cloudinary' as const;
  private readonly logger = new Logger(CloudinaryStorageProvider.name);
  private readonly cloudName: string;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    this.cloudName = configService.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
    // Configured once, in the constructor rather than a lifecycle hook — the SDK's `config()` just
    // sets module-level state read by every later `cloudinary.*` call, so there is no async
    // initialization step here that would need `OnModuleInit` to sequence correctly.
    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: configService.get<string>('CLOUDINARY_API_KEY') ?? '',
      api_secret: configService.get<string>('CLOUDINARY_API_SECRET') ?? '',
      secure: true,
    });
  }

  createUploadAuthorization(input: CreateUploadAuthorizationInput): Promise<UploadAuthorization> {
    const timestamp = Math.floor(Date.now() / 1000);
    // Every param the client's own direct-upload request includes (besides `file`/`api_key`/
    // `cloud_name`, which are never signed) must appear here exactly, or Cloudinary rejects the
    // signature as a mismatch. `folder` is the load-bearing one — it's owner-scoped, so a client
    // that tampers with it to reach someone else's folder invalidates the signature — and the
    // format/size caps ride along so an unusable upload is refused before it is ever stored.
    // `max_file_size` is deliberately absent: Cloudinary drops it before computing its own expected
    // signature (its "String to sign" comes back as `allowed_formats&folder&timestamp`), so signing
    // it guarantees a mismatch and rejects *every* upload. Size is enforced at confirm instead —
    // see `MAX_UPLOAD_BYTES` in `verifyUpload` — plus a client-side pre-check so the user finds out
    // before spending the upload.
    const paramsToSign = {
      timestamp,
      folder: input.folder,
      allowed_formats: ALLOWED_UPLOAD_FORMATS,
    };
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      cloudinary.config().api_secret ?? ''
    );

    return Promise.resolve({
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      formFields: {
        api_key: cloudinary.config().api_key ?? '',
        signature,
        timestamp: String(timestamp),
        folder: input.folder,
        allowed_formats: ALLOWED_UPLOAD_FORMATS,
      },
    });
  }

  async verifyUpload(providerAssetId: string, expectedFolder: string): Promise<VerifyUploadResult> {
    // `asset_folder`, not `folder`: this account is on Cloudinary's "dynamic folder" mode (the
    // default for newer accounts), where the Admin API's resource read reports the asset's actual
    // folder via `asset_folder` and leaves the older, "fixed folder" mode's `folder` field empty.
    // `public_id` itself is also folder-prefixed (`avatars/<id>`) in this mode, but `asset_folder`
    // is the field Cloudinary documents as authoritative for "which folder is this asset in."
    let resource: { secure_url: string; format: string; bytes: number; asset_folder?: string };
    try {
      // An authenticated, signed server-to-Cloudinary read — this is what makes `verifyUpload`
      // trustworthy rather than a rubber stamp on whatever the client claims it uploaded.
      resource = (await cloudinary.api.resource(providerAssetId, {
        resource_type: 'image',
      })) as typeof resource;
    } catch (error) {
      this.logger.warn(
        `Could not verify Cloudinary asset "${providerAssetId}": ${error instanceof Error ? error.message : String(error)}`
      );
      return { ok: false, reason: 'notFound' };
    }

    if (resource.asset_folder !== expectedFolder) {
      this.logger.warn(
        `Cloudinary asset "${providerAssetId}" is in folder "${resource.asset_folder ?? ''}", expected "${expectedFolder}" — refusing to confirm it.`
      );
      return { ok: false, reason: 'notFound' };
    }

    const mimeType = FORMAT_TO_MIME_TYPE[resource.format];
    if (!mimeType) {
      this.logger.warn(
        `Cloudinary asset "${providerAssetId}" has an unexpected format "${resource.format}".`
      );
      return { ok: false, reason: 'unsupportedFormat' };
    }

    // The size cap can't ride in the signature (see `createUploadAuthorization`), so it is enforced
    // here instead: an oversized file may reach Cloudinary, but it can never become an avatar.
    if (resource.bytes > MAX_UPLOAD_BYTES) {
      this.logger.warn(
        `Cloudinary asset "${providerAssetId}" is ${String(resource.bytes)} bytes, over the ${String(MAX_UPLOAD_BYTES)}-byte limit.`
      );
      return { ok: false, reason: 'tooLarge' };
    }

    return { ok: true, upload: { url: resource.secure_url, mimeType, sizeBytes: resource.bytes } };
  }

  /**
   * Throws on anything but a confirmed deletion, because `uploader.destroy` *resolves* for
   * failures too — `{result: 'not found'}` for an id that isn't there, `{result: 'error'}` for a
   * rejected call — rather than rejecting. Taking the resolve at face value meant the caller's
   * best-effort `.catch()` never fired and every failed cleanup passed silently, which is exactly
   * the case that leaves an asset orphaned and nobody any the wiser.
   */
  async delete(providerAssetId: string): Promise<void> {
    const outcome = (await cloudinary.uploader.destroy(providerAssetId)) as { result?: string };

    if (outcome.result !== 'ok') {
      throw new Error(
        `Cloudinary refused to delete "${providerAssetId}": ${outcome.result ?? 'unknown result'}`
      );
    }
  }
}
