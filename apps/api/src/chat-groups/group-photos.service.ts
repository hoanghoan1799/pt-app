import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { CHAT_PHOTO_PENDING_TTL_MS, chatCheckPhoto } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { Clock } from "../common/clock.js";
import { returnedRows } from "../common/sql.js";
import {
  FILE_STORAGE,
  type FileStorage,
  type StoredFile,
} from "../files/file-storage.js";
import { avatarVersion, decodeAvatarDataUrl } from "../files/image-rules.js";
import { GroupAccess } from "./group.access.js";
import { groupErrors } from "./group.errors.js";
import { isValidGroupAvatarToken } from "./group.mapper.js";

// Photos in groups (company group-photos.ts): pending from the upload until a
// message carries it, bytes in chat_group_photos through FileStorage like the
// coach chat. The uploader and the group always come from the session and
// GroupAccess, never from the client.
@Injectable()
export class GroupPhotosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly access: GroupAccess,
    private readonly clock: Clock,
  ) {}

  // The same rules as sending (managers-only, chat off, restricted, left,
  // dissolved), then the bytes check.
  async upload(auth: AuthActor, groupId: number, bytes: Buffer) {
    const context = await this.access.load(auth, groupId);

    this.access.requireWrite(context);
    const check = chatCheckPhoto(bytes);

    if (!check.ok) {
      throw check.error === "too_large"
        ? groupErrors.photoTooLarge()
        : groupErrors.badImage();
    }
    const now = this.clock.now();

    await this.dataSource.query(
      `DELETE FROM chat_group_photos WHERE message_id IS NULL AND created_at < $1`,
      [new Date(now.getTime() - CHAT_PHOTO_PENDING_TTL_MS)],
    );
    const inserted = returnedRows<{ id: number }>(
      await this.dataSource.query(
        `INSERT INTO chat_group_photos
           (group_id, uploader_key, mime, width, height, data, size, created_at)
         VALUES ($1, $2, $3, $4, $5, ''::bytea, 0, $6)
         RETURNING id`,
        [
          context.group.id,
          context.actor.key,
          check.mime,
          check.width,
          check.height,
          now,
        ],
      ),
    );
    const id = inserted[0].id;

    try {
      await this.storage.put(
        { collection: "chat-group-photo", id },
        { mime: check.mime, bytes },
      );
    } catch (error) {
      await this.storage.remove({ collection: "chat-group-photo", id });
      throw error;
    }
    return id;
  }

  // The photo of a live (not unsent) message, only for a member of its group
  // and only through that group's URL; a pending upload is visible to nobody.
  // A hidden message's photo is kept for the managers who moderate. Anything
  // else is "not found" (never 403, so ids reveal nothing).
  async serve(
    auth: AuthActor,
    groupId: number,
    photoId: number,
  ): Promise<StoredFile> {
    const rows: { hidden: boolean }[] = await this.dataSource.query(
      `SELECT m.hidden_at IS NOT NULL AS hidden
       FROM chat_group_photos p
       JOIN chat_group_messages m ON m.id = p.message_id AND m.group_id = p.group_id
       WHERE p.id = $1 AND p.group_id = $2 AND m.deleted_at IS NULL`,
      [photoId, groupId],
    );
    const context = rows[0] ? await this.access.find(auth, groupId) : null;

    if (!context || (rows[0].hidden && !context.actor.canManage)) {
      throw groupErrors.photoNotFound();
    }
    const file = await this.storage.get({
      collection: "chat-group-photo",
      id: photoId,
    });

    if (!file) {
      throw groupErrors.photoNotFound();
    }
    return file;
  }

  // The group photo: the signed URL (`?v=&t=`) is the capability, like the
  // avatars of users and admins; a member needs no token. A stale or wrong
  // token answers like a missing photo.
  async avatar(
    auth: AuthActor,
    groupId: number,
    token: string | undefined,
  ): Promise<StoredFile & { versionTag: string }> {
    const rows: { avatar: string | null; updatedAt: Date | null }[] =
      await this.dataSource.query(
        `SELECT avatar, avatar_updated_at AS "updatedAt" FROM chat_groups WHERE id = $1`,
        [groupId],
      );
    const row = rows[0];

    if (!row?.avatar || !row.updatedAt) {
      throw groupErrors.avatarNotFound();
    }
    const versionTag = avatarVersion(row.updatedAt);

    if (
      !isValidGroupAvatarToken(groupId, versionTag, token) &&
      !(await this.access.find(auth, groupId))
    ) {
      throw groupErrors.avatarNotFound();
    }
    const decoded = decodeAvatarDataUrl(row.avatar);

    if (!decoded.ok) {
      throw groupErrors.avatarNotFound();
    }
    return {
      mime: decoded.mime,
      bytes: Buffer.from(decoded.bytes),
      version: row.updatedAt,
      versionTag,
    };
  }
}
