import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { AvatarMime } from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
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
    const row = await this.repo(ref).findOne({
      where: { id: ref.id } as never,
      select: { avatarUpdatedAt: true } as never,
    });

    return row?.avatarUpdatedAt ?? null;
  }

  async remove(ref: FileRef) {
    await this.repo(ref).update({ id: ref.id } as never, {
      avatar: null,
      avatarUpdatedAt: null,
    });
  }
}
