import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MediaFile } from '../interfaces/media.interface';

export class MediaResponseDto {
  @ApiProperty({ description: 'Media ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Owner user ID', example: '550e8400-e29b-41d4-a716-446655440001' })
  userId!: string;

  @ApiProperty({ description: 'Stored filename', example: 'media/2026/02/abc123-image.png' })
  filename!: string;

  @ApiProperty({ description: 'Original filename from upload', example: 'my-photo.png' })
  originalName!: string;

  @ApiProperty({ description: 'MIME type', example: 'image/png' })
  mimeType!: string;

  @ApiProperty({ description: 'File size in bytes (as string)', example: '1048576' })
  size!: string;

  @ApiProperty({ description: 'Storage provider used', example: 's3' })
  storageProvider!: string;

  @ApiProperty({ description: 'Storage key / path', example: 'media/2026/02/abc123-image.png' })
  storageKey!: string;

  @ApiPropertyOptional({ description: 'Public URL of the file', nullable: true })
  url!: string | null;

  @ApiPropertyOptional({ description: 'Thumbnail URL if available', nullable: true })
  thumbnailUrl!: string | null;

  @ApiPropertyOptional({ description: 'Additional metadata', nullable: true, type: Object })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ description: 'Upload timestamp' })
  createdAt!: Date;

  /**
   * Factory method to create a MediaResponseDto from a MediaFile domain object.
   */
  static fromMediaFile(mediaFile: MediaFile): MediaResponseDto {
    const dto = new MediaResponseDto();
    dto.id = mediaFile.id;
    dto.userId = mediaFile.userId;
    dto.filename = mediaFile.filename;
    dto.originalName = mediaFile.originalName;
    dto.mimeType = mediaFile.mimeType;
    dto.size = mediaFile.size;
    dto.storageProvider = mediaFile.storageProvider;
    dto.storageKey = mediaFile.storageKey;
    dto.url = mediaFile.url;
    dto.thumbnailUrl = mediaFile.thumbnailUrl;
    dto.metadata = mediaFile.metadata;
    dto.createdAt = mediaFile.createdAt;
    return dto;
  }
}
