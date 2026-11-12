import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  CHAT_MESSAGES,
  STICKER_CUSTOM_MAX_PER_OWNER,
  STICKER_ERRORS,
  stickerCheckImage,
  stickerCustomRef,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";
import { Clock } from "../common/clock.js";
import { notFoundError, payloadTooLargeError } from "../common/errors.js";
import {
  FILE_STORAGE,
  type FileStorage,
  type StoredFile,
} from "../files/file-storage.js";

export type StickerOwner = { kind: "user" | "admin"; id: number };

export const stickerOwnerOf = (actor: AuthActor): StickerOwner => ({
  kind: actor.kind,
  id: actor.id,
});

const rule = (status: HttpStatus, code: string, message: string) =>
  new HttpException({ code, message }, status);

const stickerNotFound = () =>
  notFoundError("STICKER_NOT_FOUND", STICKER_ERRORS.NOT_FOUND);

// Personal stickers (KAN-158): storage and access rules. The owner always
// comes from the session, never from the client.
@Injectable()
export class CustomStickersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly clock: Clock,
    private readonly scope: PtScopePolicy,
    private readonly scopeQueries: TraineeScopeQueries,
  ) {}

  // A trainee whose chat is locked cannot manage stickers (admins always can).
  async requireChatOn(actor: AuthActor) {
    if (actor.kind === "admin") {
      return;
    }
    const rows: { chatEnabled: boolean | null }[] = await this.dataSource.query(
      `SELECT chat_enabled AS "chatEnabled" FROM users WHERE id = $1`,
      [actor.id],
    );

    if (rows[0]?.chatEnabled !== true) {
      throw rule(
        HttpStatus.FORBIDDEN,
        "CHAT_LOCKED",
        CHAT_MESSAGES.CHAT_LOCKED,
      );
    }
  }

  // Ids of my stickers, newest first.
  async list(owner: StickerOwner) {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM chat_custom_stickers
       WHERE owner_kind = $1 AND owner_id = $2 AND deleted_at IS NULL
       ORDER BY id DESC`,
      [owner.kind, owner.id],
    );

    return rows.map((row) => row.id);
  }

  // A full set rejects the new image rather than silently dropping an old one.
  async create(owner: StickerOwner, bytes: Buffer) {
    const check = stickerCheckImage(bytes);

    if (!check.ok) {
      throw check.error === "too_large"
        ? payloadTooLargeError("STICKER_TOO_LARGE", STICKER_ERRORS.TOO_LARGE)
        : rule(
            HttpStatus.BAD_REQUEST,
            "STICKER_BAD_IMAGE",
            STICKER_ERRORS.BAD_IMAGE,
          );
    }
    const [{ total }]: { total: number }[] = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM chat_custom_stickers
       WHERE owner_kind = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [owner.kind, owner.id],
    );

    if (total >= STICKER_CUSTOM_MAX_PER_OWNER) {
      throw rule(HttpStatus.CONFLICT, "STICKER_LIMIT", STICKER_ERRORS.LIMIT);
    }
    const rows: { id: number }[] = await this.dataSource.query(
      `INSERT INTO chat_custom_stickers (owner_kind, owner_id, mime, data, size, created_at)
       VALUES ($1, $2, $3, ''::bytea, 0, $4) RETURNING id`,
      [owner.kind, owner.id, check.mime, this.clock.now()],
    );
    const id = rows[0].id;

    try {
      await this.storage.put(
        { collection: "chat-sticker", id },
        { mime: check.mime, bytes },
      );
    } catch (error) {
      await this.storage.remove({ collection: "chat-sticker", id });
      throw error;
    }
    return id;
  }

  // True when the sender owns a live (not removed) sticker with this id.
  async owns(owner: StickerOwner, id: number) {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM chat_custom_stickers
       WHERE id = $1 AND owner_kind = $2 AND owner_id = $3 AND deleted_at IS NULL`,
      [id, owner.kind, owner.id],
    );

    return rows.length > 0;
  }

  // Removing a sticker that was already sent only hides it from the owner's
  // list (the bubbles keep their picture); an unsent one is really deleted.
  // Someone else's id, or an unknown one, is "not found".
  async remove(owner: StickerOwner, id: number) {
    if (!(await this.owns(owner, id))) {
      throw stickerNotFound();
    }
    const sent: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM chat_messages WHERE sticker_ref = $1 LIMIT 1`,
      [stickerCustomRef(id)],
    );

    if (sent.length > 0) {
      await this.dataSource.query(
        `UPDATE chat_custom_stickers SET deleted_at = $2 WHERE id = $1`,
        [id, this.clock.now()],
      );
    } else {
      await this.storage.remove({ collection: "chat-sticker", id });
    }
  }

  // Who may see the picture: its owner (while it is in their list), a trainee
  // whose own conversation it was sent in, and an admin who can access the
  // trainee of a conversation it was sent in. An unsent message no longer
  // grants access.
  async serve(actor: AuthActor, id: number): Promise<StoredFile> {
    if (!(await this.mayView(actor, id))) {
      throw stickerNotFound();
    }
    const file = await this.storage.get({ collection: "chat-sticker", id });

    if (!file) {
      throw stickerNotFound();
    }
    return file;
  }

  private async mayView(actor: AuthActor, id: number) {
    const stickers: {
      ownerKind: string;
      ownerId: number;
      deletedAt: Date | null;
    }[] = await this.dataSource.query(
      `SELECT owner_kind AS "ownerKind", owner_id AS "ownerId", deleted_at AS "deletedAt"
         FROM chat_custom_stickers WHERE id = $1`,
      [id],
    );
    const sticker = stickers[0];

    if (!sticker) {
      return false;
    }
    if (
      sticker.ownerKind === actor.kind &&
      sticker.ownerId === actor.id &&
      sticker.deletedAt === null
    ) {
      return true;
    }
    const trainees: { userId: number }[] = await this.dataSource.query(
      `SELECT DISTINCT c.user_id AS "userId"
       FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id
       WHERE m.sticker_ref = $1 AND m.deleted_at IS NULL
       ${actor.kind === "user" ? "AND c.user_id = $2" : ""}
       LIMIT 100`,
      actor.kind === "user"
        ? [stickerCustomRef(id), actor.id]
        : [stickerCustomRef(id)],
    );

    if (actor.kind === "user") {
      return trainees.length > 0;
    }
    for (const { userId } of trainees) {
      const facts = await this.scopeQueries.findByUserId(actor.id, userId);

      if (facts && this.scope.canAccessTrainee(actor, facts)) {
        return true;
      }
    }
    return false;
  }
}
