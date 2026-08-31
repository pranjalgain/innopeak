import { DBService } from '@db/db.service';
import { media } from '@db/drizzle/schema';
import { MediaFile } from '@media/interfaces/media.interface';
import { Injectable } from '@nestjs/common';
import { count, desc, eq, inArray } from 'drizzle-orm';

/** Shape of data required to create a new media record. */
interface CreateMediaData {
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: string;
  storageProvider: string;
  storageKey: string;
  url: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown> | null;
}

@Injectable()
export class MediaRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Insert a new media record and return the created row.
   */
  async create(data: CreateMediaData): Promise<MediaFile> {
    const rows = await this.dbService.db
      .insert(media)
      .values({
        userId: data.userId,
        filename: data.filename,
        originalName: data.originalName,
        mimeType: data.mimeType,
        size: data.size,
        storageProvider: data.storageProvider,
        storageKey: data.storageKey,
        url: data.url,
        thumbnailUrl: data.thumbnailUrl,
        metadata: data.metadata,
      })
      .returning();

    const row = rows[0];

    if (!row) {
      throw new Error('Failed to insert media record');
    }

    return this.mapRowToMediaFile(row);
  }

  /**
   * Find a single media record by its ID.
   */
  async findById(id: string): Promise<MediaFile | null> {
    const rows = await this.dbService.db.select().from(media).where(eq(media.id, id)).limit(1);

    const row = rows[0];

    if (!row) {
      return null;
    }

    return this.mapRowToMediaFile(row);
  }

  /**
   * Find all media records for a given user with pagination.
   * Returns the paginated rows and total count.
   */
  async findByUserId(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ data: MediaFile[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      this.dbService.db.select({ count: count() }).from(media).where(eq(media.userId, userId)),
      this.dbService.db
        .select()
        .from(media)
        .where(eq(media.userId, userId))
        .orderBy(desc(media.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: rows.map(row => this.mapRowToMediaFile(row)),
      total,
    };
  }

  /**
   * Delete a media record by its ID.
   */
  async delete(id: string): Promise<void> {
    await this.dbService.db.delete(media).where(eq(media.id, id));
  }

  /**
   * Find multiple media records by their IDs.
   */
  async findByIds(ids: string[]): Promise<MediaFile[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.dbService.db.select().from(media).where(inArray(media.id, ids));

    return rows.map(row => this.mapRowToMediaFile(row));
  }

  /**
   * Map a raw database row to the MediaFile interface.
   */
  private mapRowToMediaFile(row: {
    id: string;
    userId: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: string;
    storageProvider: string;
    storageKey: string;
    url: string | null;
    thumbnailUrl: string | null;
    metadata: unknown;
    createdAt: Date;
  }): MediaFile {
    return {
      id: row.id,
      userId: row.userId,
      filename: row.filename,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      storageProvider: row.storageProvider,
      storageKey: row.storageKey,
      url: row.url,
      thumbnailUrl: row.thumbnailUrl,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
    };
  }
}
