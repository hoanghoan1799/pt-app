import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { AvatarMime } from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { returnedRows } from "../common/sql.js";
import type { FileRef, FileStorage, StoredFile } from "./file-storage.js";
import { detectImageMime } from "./image-rules.js";

// Avatars: one row per owner in its own table (bytes, mime, size); the cache
// version also sits in `avatar_updated_at` of the owner row, so the many
// readers that only build URLs never touch the bytes.
const AVATAR_TABLES = {
  "avatar-user": { table: "user_avatars", key: "user_id", owner: "users" },
  "avatar-admin": { table: "admin_avatars", key: "admin_id", owner: "admins" },
} as const;

const avatarTable = (ref: FileRef) =>
  ref.collection in AVATAR_TABLES
    ? AVATAR_TABLES[ref.collection as keyof typeof AVATAR_TABLES]
    : null;

// Chat collections: the bytes sit in the `data` / `mime` / `size` columns of
// the row the owning service created; `created_at` is the version.
const BLOB_TABLES = {
  "chat-photo": "chat_photos",
  "chat-sticker": "chat_custom_stickers",
  "dm-photo": "dm_photos",
  "social-photo": "social_post_photos",
} as const;

const blobTable = (ref: FileRef) =>
  ref.collection in BLOB_TABLES
    ? BLOB_TABLES[ref.collection as keyof typeof BLOB_TABLES]
    : null;

const wholeSeconds = (date: Date) =>
  new Date(Math.floor(date.getTime() / 1000) * 1000);

// Only this adapter knows where the bytes live. `version` never reads them.
@Injectable()
export class BytesInPostgresStorage implements FileStorage {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  async put(ref: FileRef, file: { mime: AvatarMime; bytes: Buffer }) {
    if (detectImageMime(file.bytes) !== file.mime) {
      throw new Error("Stored bytes do not match the declared type");
    }
    const table = blobTable(ref);

    if (table) {
      const rows = returnedRows<{ created_at: Date }>(
        await this.dataSource.query(
          `UPDATE ${table} SET data = $1, mime = $2, size = $3 WHERE id = $4 RETURNING created_at`,
          [file.bytes, file.mime, file.bytes.length, ref.id],
        ),
      );

      if (rows.length === 0) {
        throw new Error("No row to store the file in");
      }
      return wholeSeconds(rows[0].created_at);
    }
    const avatar = avatarTable(ref);

    if (!avatar) {
      throw new Error("Unknown file collection");
    }
    const version = wholeSeconds(this.clock.now());

    // The bytes and the version change together or not at all.
    await this.dataSource.transaction(async (manager) => {
      const updated = returnedRows(
        await manager.query(
          `UPDATE ${avatar.owner} SET avatar_updated_at = $2 WHERE id = $1 RETURNING id`,
          [ref.id, version],
        ),
      );

      if (updated.length === 0) {
        throw new Error("No row to store the file in");
      }
      await manager.query(
        `INSERT INTO ${avatar.table} (${avatar.key}, mime, data, size, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (${avatar.key}) DO UPDATE
           SET mime = EXCLUDED.mime, data = EXCLUDED.data,
               size = EXCLUDED.size, updated_at = EXCLUDED.updated_at`,
        [ref.id, file.mime, file.bytes, file.bytes.length, version],
      );
    });
    return version;
  }

  async get(ref: FileRef): Promise<StoredFile | null> {
    const table = blobTable(ref);

    if (table) {
      const rows: { data: Buffer; mime: AvatarMime; created_at: Date }[] =
        await this.dataSource.query(
          `SELECT data, mime, created_at FROM ${table} WHERE id = $1`,
          [ref.id],
        );
      const row = rows[0];

      return row &&
        row.data.length > 0 &&
        detectImageMime(row.data) === row.mime
        ? {
            mime: row.mime,
            bytes: row.data,
            version: wholeSeconds(row.created_at),
          }
        : null;
    }
    const avatar = avatarTable(ref);

    if (!avatar) {
      return null;
    }
    const rows: { data: Buffer; mime: AvatarMime; updated_at: Date }[] =
      await this.dataSource.query(
        `SELECT data, mime, updated_at FROM ${avatar.table} WHERE ${avatar.key} = $1`,
        [ref.id],
      );
    const row = rows[0];

    return row && row.data.length > 0 && detectImageMime(row.data) === row.mime
      ? { mime: row.mime, bytes: row.data, version: row.updated_at }
      : null;
  }

  async version(ref: FileRef) {
    const table = blobTable(ref);

    if (table) {
      const rows: { created_at: Date }[] = await this.dataSource.query(
        `SELECT created_at FROM ${table} WHERE id = $1`,
        [ref.id],
      );

      return rows[0] ? wholeSeconds(rows[0].created_at) : null;
    }
    const avatar = avatarTable(ref);

    if (!avatar) {
      return null;
    }
    const rows: { avatar_updated_at: Date | null }[] =
      await this.dataSource.query(
        `SELECT avatar_updated_at FROM ${avatar.owner} WHERE id = $1`,
        [ref.id],
      );

    return rows[0]?.avatar_updated_at ?? null;
  }

  async remove(ref: FileRef) {
    const table = blobTable(ref);

    if (table) {
      await this.dataSource.query(`DELETE FROM ${table} WHERE id = $1`, [
        ref.id,
      ]);
      return;
    }
    const avatar = avatarTable(ref);

    if (!avatar) {
      return;
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM ${avatar.table} WHERE ${avatar.key} = $1`,
        [ref.id],
      );
      await manager.query(
        `UPDATE ${avatar.owner} SET avatar_updated_at = NULL WHERE id = $1`,
        [ref.id],
      );
    });
  }
}
