import {
  Check,
  Column,
  Entity,
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
@Index("chat_messages_conversation_client", ["conversationId", "clientId"], {
  unique: true,
})
@Index("chat_messages_conversation_id", ["conversationId", "id"])
@Check(`"sender_role" IN ('user', 'admin')`)
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

  @Column({ type: "integer", nullable: true })
  senderAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "sender_admin_id" })
  senderAdmin!: Relation<Admin> | null;

  @Column({ type: "text", default: "" })
  body!: string;

  @Column({ type: "text", nullable: true })
  attachmentUrl!: string | null;

  @Column({ type: "text", nullable: true })
  attachmentMeta!: string | null;

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

  @ManyToOne(() => ChatMessage, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reply_to_message_id" })
  replyToMessage!: Relation<ChatMessage> | null;

  @Column({ type: "text", nullable: true })
  stickerRef!: string | null;

  @Column({ type: "text", nullable: true })
  stickerUrl!: string | null;

  @Column({ type: "integer", nullable: true })
  photoId!: number | null;

  @ManyToOne(() => ChatPhoto, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "photo_id" })
  photo!: Relation<ChatPhoto> | null;

  @Column({ type: "integer", nullable: true })
  replyPostId!: number | null;

  @ManyToOne(() => SocialPost, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reply_post_id" })
  replyPost!: Relation<SocialPost> | null;

  @Column({ type: "boolean", nullable: true })
  silent!: boolean | null;

  @Column({ type: "timestamptz", nullable: true })
  editedAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  updatedAt!: Date | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
