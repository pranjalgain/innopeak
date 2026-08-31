import { MediaRepository } from '@db/repositories/media/media.repository';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { MediaFile, StorageProviderType } from './interfaces/media.interface';
import { StorageProvider } from './providers/storage.provider';

/** Default signed URL expiration: 1 hour */
const SIGNED_URL_EXPIRY_SECONDS = 3600;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly storageProvider: StorageProvider
  ) {}

  /**
   * Upload a file for a given user.
   * Generates a unique storage key, delegates to the storage provider,
   * and persists the record via the repository.
   */
  async upload(
    userId: string,
    file: Express.Multer.File,
    metadata?: Record<string, unknown>
  ): Promise<MediaFile> {
    const storageKey = this.generateStorageKey(file.originalname);

    const uploadResult = await this.storageProvider.upload(file, storageKey);

    const mediaRecord = await this.mediaRepository.create({
      userId,
      filename: storageKey,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: String(file.size),
      storageProvider: this.getProviderName(),
      storageKey: uploadResult.storageKey,
      url: uploadResult.url,
      thumbnailUrl: uploadResult.thumbnailUrl,
      metadata: metadata ?? null,
    });

    this.logger.log(`Media uploaded: id=${mediaRecord.id}, user=${userId}, key=${storageKey}`);

    return mediaRecord;
  }

  /**
   * Get a media record by its ID.
   */
  async getById(id: string): Promise<MediaFile> {
    const mediaFile = await this.mediaRepository.findById(id);

    if (!mediaFile) {
      throw new NotFoundException(`Media with id '${id}' not found`);
    }

    return mediaFile;
  }

  /**
   * Get paginated media records for a specific user.
   */
  async getByUserId(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ data: MediaFile[]; total: number }> {
    return this.mediaRepository.findByUserId(userId, page, pageSize);
  }

  /**
   * Delete a media file. Verifies ownership before proceeding.
   * Removes the file from the storage provider and deletes the DB record.
   */
  async delete(id: string, userId: string): Promise<void> {
    const mediaFile = await this.mediaRepository.findById(id);

    if (!mediaFile) {
      throw new NotFoundException(`Media with id '${id}' not found`);
    }

    if (mediaFile.userId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this media');
    }

    await this.storageProvider.delete(mediaFile.storageKey);
    await this.mediaRepository.delete(id);

    this.logger.log(`Media deleted: id=${id}, user=${userId}`);
  }

  /**
   * Generate a presigned URL for a media file. Verifies ownership.
   */
  async getSignedUrl(id: string, userId: string): Promise<string> {
    const mediaFile = await this.mediaRepository.findById(id);

    if (!mediaFile) {
      throw new NotFoundException(`Media with id '${id}' not found`);
    }

    if (mediaFile.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this media');
    }

    const signedUrl = await this.storageProvider.getSignedUrl(
      mediaFile.storageKey,
      SIGNED_URL_EXPIRY_SECONDS
    );

    return signedUrl;
  }

  /**
   * Generate a unique storage key based on date and UUID.
   * Format: media/YYYY/MM/uuid-originalname
   */
  private generateStorageKey(originalName: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const uniqueId = uuidv4();

    // Sanitize the original name to prevent path traversal
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');

    return `media/${year}/${month}/${uniqueId}-${sanitizedName}`;
  }

  /**
   * Derive the provider name from the injected StorageProvider instance.
   */
  private getProviderName(): string {
    const constructorName = this.storageProvider.constructor.name;

    if (constructorName.toLowerCase().includes('s3')) {
      return StorageProviderType.S3;
    }

    if (constructorName.toLowerCase().includes('cloudinary')) {
      return StorageProviderType.CLOUDINARY;
    }

    return StorageProviderType.LOCAL;
  }
}
