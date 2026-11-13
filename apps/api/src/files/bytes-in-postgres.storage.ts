import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { AvatarMime } from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { returnedRows } from "../common/sql.js";
import { Admin } from "../database/entities/admin.entity.js";
import { User } from "../database/entities/user.entity.js";
import type { FileRef, FileStorage, StoredFile } from "./file-storage.js";
import {
  decodeAvatarDataUrl,
  detectImageMime,
  encodeDataUrl,
} from "./image-rules.js";

const entityOf = (ref: FileRef) =>
  ref.collection === "avatar-admin" ? Admin : User;

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

// Avatars stay in the `avatar` / `avatar_updated_at` columns of users and
// admins, as a data URL, exactly the format migrated from Turso (no data
// conversion at cutover). Only this adapter knows that; it never selects the
// bulky column except in `get`.
@Injectable()
export class BytesInPostgresStorage implements FileStorage {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  private repo(ref: FileRef) {
    return this.dataSource.getRepository<{
      avatar: string | null;
      avatarUpdatedAt: Date | null;
    }>(entityOf(ref) as never);
  }

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
    const version = new Date(
      Math.floor(this.clock.now().getTime() / 1000) * 1000,
    );

    await this.repo(ref).update({ id: ref.id } as never, {
      avatar: encodeDataUrl(file.mime, file.bytes),
      avatarUpdatedAt: version,
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
    const row = await this.repo(ref).findOne({
      where: { id: ref.id } as never,
      select: { avatar: true, avatarUpdatedAt: true } as never,
    });

    if (!row?.avatar || !row.avatarUpdatedAt) {
      return null;
    }
    const decoded = decodeAvatarDataUrl(row.avatar);

    return decoded.ok
      ? {
          mime: decoded.mime,
          bytes: decoded.bytes,
          version: row.avatarUpdatedAt,
        }
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
    const row = await this.repo(ref).findOne({
      where: { id: ref.id } as never,
      select: { avatarUpdatedAt: true } as never,
    });

    return row?.avatarUpdatedAt ?? null;
  }

  async remove(ref: FileRef) {
    const table = blobTable(ref);

    if (table) {
      await this.dataSource.query(`DELETE FROM ${table} WHERE id = $1`, [
        ref.id,
      ]);
      return;
    }
    await this.repo(ref).update({ id: ref.id } as never, {
      avatar: null,
      avatarUpdatedAt: null,
    });
  }
}
