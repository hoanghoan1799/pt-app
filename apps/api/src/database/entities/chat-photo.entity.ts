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

import { adminKeyId, chatKeyCheck,GeneratedId } from "./actor-ids.js";
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
@Index("chat_photos_message", ["messageId"])
@Index("chat_photos_conversation", ["conversationId"])
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

  @ManyToOne(() => ChatMessage, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "message_id" })
  message!: Relation<ChatMessage> | null;

  @Column({ type: "text" })
  uploaderKey!: string;

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
