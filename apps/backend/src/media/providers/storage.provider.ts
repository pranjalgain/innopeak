import type { UploadResult } from '../interfaces/media.interface';

/**
 * Abstract storage provider defining the contract for all storage backends.
 * Implementations must handle upload, deletion, and signed URL generation.
 */
export abstract class StorageProvider {
  /**
   * Upload a file to the storage backend.
   * @param file - The Multer file object from the HTTP request
   * @param key - The unique storage key (path) for the file
   * @returns Upload result with the storage key, public URL, and optional thumbnail URL
   */
  abstract upload(file: Express.Multer.File, key: string): Promise<UploadResult>;

  /**
   * Delete a file from the storage backend.
   * @param key - The storage key of the file to delete
   */
  abstract delete(key: string): Promise<void>;

  /**
   * Generate a time-limited signed URL for private file access.
   * @param key - The storage key of the file
   * @param expiresIn - Expiration time in seconds
   * @returns A signed URL string
   */
  abstract getSignedUrl(key: string, expiresIn: number): Promise<string>;
}
