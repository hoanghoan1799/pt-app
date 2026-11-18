import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { adminKeyId, chatKeyCheck, GeneratedId } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { ChatConversation } from "./chat-conversation.entity.js";
import { ChatMessage } from "./chat-message.entity.js";

@Entity("chat_photos")
@Check("chat_photos_uploader_key_format", chatKeyCheck("uploader_key"))
@ForeignKey(() => Admin, ["uploaderAdminId"], ["id"], {
  name: "fk_chat_photos_uploader_admin_id",
  onDelete: "CASCADE",
})
@Index("chat_photos_uploader_admin_id_idx", ["uploaderAdminId"], {
  where: `"uploader_admin_id" IS NOT NULL`,
})
// Unique so that chat_messages (id, photo_id) can reference it.
@Index("chat_photos_message_photo", ["messageId", "id"], { unique: true })
// A message carries up to 10 photos; position is the order (0 = cover, also
// chat_messages.photo_id). Deferred: the app attaches the photos (message_id)
// before the message points at its cover (photo_id), inside one transaction.
// Deleting the message deletes them.
@ForeignKey(() => ChatMessage, ["messageId"], ["id"], {
  name: "fk_chat_photos_message",
  onDelete: "CASCADE",
  deferrable: "INITIALLY DEFERRED",
})
@Check(
  "chat_photos_position_nonnegative",
  `"position" IS NULL OR "position" >= 0`,
)
@Index("chat_photos_message_position", ["messageId", "position"], {
  unique: true,
  where: `"message_id" IS NOT NULL AND "position" IS NOT NULL`,
})
@Check("chat_photos_size_matches_data", `"size" = octet_length("data")`)
@Index(
  "chat_photos_uploader_client",
  ["conversationId", "uploaderKey", "clientId"],
  { unique: true },
)
@Check(`"mime" IN ('image/webp', 'image/jpeg', 'image/png')`)
export class ChatPhoto {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => ChatConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<ChatConversation>;

  @Column({ type: "integer", nullable: true })
  messageId!: number | null;

  @Column({ type: "text" })
  uploaderKey!: string;

  // Order inside the message (0 = cover); null (a message from before several
  // photos) counts as 0.
  @Column({ type: "integer", nullable: true })
  position!: number | null;

  // Idempotency-Key of the upload: a retry with the same key finds this row.
  @Column({ type: "text", nullable: true })
  clientId!: string | null;

  @Column({ type: "text" })
  mime!: "image/webp" | "image/jpeg" | "image/png";

  @Column({ type: "integer" })
  width!: number;

  @Column({ type: "integer" })
  height!: number;

  @Column({ type: "bytea" })
  data!: Buffer;

  @Column({ type: "integer" })
  size!: number;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @GeneratedId(adminKeyId("uploader_key"))
  uploaderAdminId!: number | null;
}
