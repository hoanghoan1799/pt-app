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

import { Admin } from "./admin.entity.js";
import { ChatConversation } from "./chat-conversation.entity.js";
import { ChatPhoto } from "./chat-photo.entity.js";
import { SocialPost } from "./social-post.entity.js";

@Entity("chat_messages")
// Unique so that a reply (and last_message_id) can reference the pair
// (conversation_id, id): both must name a message of the same conversation.
@Index("chat_messages_conversation_id", ["conversationId", "id"], {
  unique: true,
})
// Unique only so that chat_photos (message_id, id) can reference it.
@Index("chat_messages_id_photo", ["id", "photoId"], { unique: true })
@ForeignKey(
  () => ChatMessage,
  ["conversationId", "replyToMessageId"],
  ["conversationId", "id"],
  { name: "fk_chat_messages_reply_in_conversation", onDelete: "SET NULL" },
)
// message.photo_id and photo.message_id are two views of one link. This FK
// (checked at once) and the one on ChatPhoto (deferred: the app sets the photo
// side first) make them agree. Deleting the photo clears photo_id only.
// reply_post_id keeps a plain FK: a deleted post shows as removed.
@ForeignKey(() => ChatPhoto, ["id", "photoId"], ["messageId", "id"], {
  name: "fk_chat_messages_photo",
  onDelete: "SET NULL",
})
@Check(`"sender_role" IN ('user', 'admin')`)
// A trainee message never carries an admin id. The other way round is allowed:
// NULL on an admin message means the admin was removed (ON DELETE SET NULL).
@Check(
  "chat_messages_user_has_no_admin",
  `"sender_role" <> 'user' OR "sender_admin_id" IS NULL`,
)
// PG only: unique (conversation_id, sender_role, COALESCE(sender_admin_id, 0),
// client_id), created by the DbIntegrity migration. A retry by the same sender
// finds the original; another sender may reuse a client_id.
@Index("chat_messages_conversation_sender_client", { synchronize: false })
@Index("chat_messages_sender_admin_id_idx", ["senderAdminId"])
@Index("chat_messages_hidden_by_admin_id_idx", ["hiddenByAdminId"])
@Index("chat_messages_reply_to_message_id_idx", ["replyToMessageId"])
@Index("chat_messages_photo_id_idx", ["photoId"])
@Index("chat_messages_reply_post_id_idx", ["replyPostId"])
// PG only: GIN trigram index on an expression (immutable_unaccent(lower(body))), created by the baseline migration.
@Index("chat_messages_body_search_trgm", { synchronize: false })
export class ChatMessage {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => ChatConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<ChatConversation>;

  @Column({ type: "text" })
  senderRole!: "user" | "admin";

  // NULL on an admin message means the admin account was removed; the
  // history stays (ON DELETE SET NULL). Always NULL on a trainee message.
  @Column({ type: "integer", nullable: true })
  senderAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "sender_admin_id" })
  senderAdmin!: Relation<Admin> | null;

  @Column({ type: "text", default: "" })
  body!: string;

  @Column({ type: "text" })
  clientId!: string;

  @Column({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @Column({ type: "integer", nullable: true })
  hiddenByAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "hidden_by_admin_id" })
  hiddenByAdmin!: Relation<Admin> | null;

  @Column({ type: "integer", nullable: true })
  replyToMessageId!: number | null;

  @Column({ type: "text", nullable: true })
  stickerRef!: string | null;

  // Kept next to sticker_ref on purpose: a message keeps rendering its custom
  // sticker after the sticker was deleted.
  @Column({ type: "text", nullable: true })
  stickerUrl!: string | null;

  @Column({ type: "integer", nullable: true })
  photoId!: number | null;

  @Column({ type: "integer", nullable: true })
  replyPostId!: number | null;

  @ManyToOne(() => SocialPost, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reply_post_id" })
  replyPost!: Relation<SocialPost> | null;

  @Column({ type: "boolean", default: false })
  silent!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  editedAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  updatedAt!: Date | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
