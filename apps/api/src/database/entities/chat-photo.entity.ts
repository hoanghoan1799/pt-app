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

import { ChatConversation } from "./chat-conversation.entity.js";
import { ChatMessage } from "./chat-message.entity.js";

@Entity("chat_photos")
@Index("chat_photos_message", ["messageId"])
@Index("chat_photos_conversation", ["conversationId"])
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
}
