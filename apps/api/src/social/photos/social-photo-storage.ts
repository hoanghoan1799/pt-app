import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import type { PhotoMime } from "../domain/photo-check.js";

export type StoredPhoto = { mime: PhotoMime; data: Buffer };

// TEMPORARY port for the bytes of post photos, shaped like the shared
// FileStorage (put / get / delete) so the Files step can replace the adapter
// at merge time. Metadata (post link, uploader, size) stays in
// social_post_photos either way.
export abstract class SocialPhotoStorage {
  abstract put(
    file: {
      uploaderKey: string;
      mime: PhotoMime;
      width: number;
      height: number;
      bytes: Uint8Array;
    },
    now: Date,
  ): Promise<number>;

  abstract get(id: number): Promise<StoredPhoto | null>;

  // Uploads that never became a post and are older than `before`.
  abstract deleteStale(before: Date): Promise<void>;
}

// bytea in social_post_photos (MVP storage decision).
@Injectable()
export class ByteaSocialPhotoStorage extends SocialPhotoStorage {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async put(
    file: Parameters<SocialPhotoStorage["put"]>[0],
    now: Date,
  ): Promise<number> {
    const rows: { id: number }[] = await this.dataSource.query(
      `INSERT INTO social_post_photos
         (uploader_key, mime, width, height, data, size, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        file.uploaderKey,
        file.mime,
        file.width,
        file.height,
        Buffer.from(file.bytes),
        file.bytes.length,
        now,
      ],
    );

    return rows[0].id;
  }

  async get(id: number): Promise<StoredPhoto | null> {
    const rows: { mime: PhotoMime; data: Buffer }[] =
      await this.dataSource.query(
        `SELECT mime, data FROM social_post_photos WHERE id = $1`,
        [id],
      );

    return rows[0] ?? null;
  }

  async deleteStale(before: Date): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM social_post_photos WHERE post_id IS NULL AND created_at < $1`,
      [before],
    );
  }
}
