import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { CHAT_PHOTO_PENDING_TTL_MS, chatCheckPhoto } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { Clock } from "../common/clock.js";
import {
  FILE_STORAGE,
  type FileStorage,
  type StoredFile,
} from "../files/file-storage.js";
import { ChatAccess, type ChatContext } from "./chat.access.js";
import { chatErrors } from "./chat.errors.js";
import { ChatPolicy } from "./chat.policy.js";
import { ChatQueries } from "./chat.queries.js";

export const photoUploaderKey = (actor: AuthActor) =>
  actor.kind === "user" ? "user" : `admin:${actor.id}`;

// Photos in chat (KAN-160): upload, attach rules and serving. The uploader and
// the conversation always come from the session, never from the client. The
// bytes go through FileStorage.
@Injectable()
export class ChatPhotosService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly queries: ChatQueries,
    private readonly access: ChatAccess,
    private readonly policy: ChatPolicy,
    private readonly clock: Clock,
  ) {}

  // Stores a pending photo (it becomes visible once a message carries it).
  // `key` is the Idempotency-Key: a retry returns the first upload's id.
  async upload(context: ChatContext, bytes: Buffer, key: string | null) {
    this.access.requireWrite(context);
    const check = chatCheckPhoto(bytes);

    if (!check.ok) {
      throw check.error === "too_large"
        ? chatErrors.photoTooLarge()
        : chatErrors.badImage();
    }
    const conversation =
      context.conversation ??
      (await this.queries.getOrCreateConversation(context.trainee.traineeId));
    const uploaderKey = photoUploaderKey(context.actor);
    const now = this.clock.now();

    await this.dataSource.query(
      `DELETE FROM chat_photos WHERE message_id IS NULL AND created_at < $1`,
      [new Date(now.getTime() - CHAT_PHOTO_PENDING_TTL_MS)],
    );
    const inserted: { id: number }[] = await this.dataSource.query(
      `INSERT INTO chat_photos
         (conversation_id, uploader_key, client_id, mime, width, height, data, size, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, ''::bytea, 0, $7)
       ON CONFLICT (conversation_id, uploader_key, client_id) DO NOTHING
       RETURNING id`,
      [
        conversation.id,
        uploaderKey,
        key,
        check.mime,
        check.width,
        check.height,
        now,
      ],
    );

    if (inserted.length === 0) {
      const existing: { id: number }[] = await this.dataSource.query(
        `SELECT id FROM chat_photos
         WHERE conversation_id = $1 AND uploader_key = $2 AND client_id = $3`,
        [conversation.id, uploaderKey, key],
      );

      return { id: existing[0].id, created: false };
    }
    const id = inserted[0].id;

    try {
      await this.storage.put(
        { collection: "chat-photo", id },
        { mime: check.mime, bytes },
      );
    } catch (error) {
      await this.storage.remove({ collection: "chat-photo", id });
      throw error;
    }
    return { id, created: true };
  }

  // A photo may be attached once, by the person who uploaded it, to a message
  // in the conversation it was uploaded for.
  async isAttachable(
    photoId: number,
    conversationId: number,
    uploaderKey: string,
  ) {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM chat_photos
       WHERE id = $1 AND conversation_id = $2 AND uploader_key = $3
         AND message_id IS NULL`,
      [photoId, conversationId, uploaderKey],
    );

    return rows.length > 0;
  }

  // The bytes, only for a photo that belongs to a message, to the trainee of
  // the conversation and any admin who can access that trainee (a hidden one
  // only after the passcode reveal). Everything else is "not found".
  async serve(actor: AuthActor, photoId: number): Promise<StoredFile> {
    const rows: { traineeId: number }[] = await this.dataSource.query(
      `SELECT c.user_id AS "traineeId"
       FROM chat_photos p JOIN chat_conversations c ON c.id = p.conversation_id
       WHERE p.id = $1 AND p.message_id IS NOT NULL`,
      [photoId],
    );
    const trainee = rows[0]
      ? await this.queries.findTraineeFacts(
          rows[0].traineeId,
          actor.kind === "admin" ? actor.id : null,
        )
      : null;

    if (!trainee || !this.policy.canRead(actor, trainee)) {
      throw chatErrors.photoNotFound();
    }
    const file = await this.storage.get({
      collection: "chat-photo",
      id: photoId,
    });

    if (!file) {
      throw chatErrors.photoNotFound();
    }
    return file;
  }
}
