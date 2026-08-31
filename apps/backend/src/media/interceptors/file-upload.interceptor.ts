import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed MIME type patterns */
const ALLOWED_MIME_PATTERNS = [
  /^image\/.+$/,
  /^video\/.+$/,
  /^application\/pdf$/,
  /^application\/zip$/,
];

/**
 * Validates that the uploaded file's MIME type matches one of the allowed patterns.
 */
function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_PATTERNS.some(pattern => pattern.test(mimeType));
}

/**
 * Pre-configured FileInterceptor for media uploads.
 *
 * - Field name: `file`
 * - Max file size: 10 MB
 * - Allowed types: images, videos, PDF, ZIP
 * - Uses memory storage (buffer-based) for provider-agnostic streaming
 */
export const FileUploadInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedMimeType(file.mimetype)) {
      callback(
        new BadRequestException(
          `File type '${file.mimetype}' is not allowed. Allowed types: images, videos, PDF, ZIP.`
        ),
        false
      );
      return;
    }

    callback(null, true);
  },
});
