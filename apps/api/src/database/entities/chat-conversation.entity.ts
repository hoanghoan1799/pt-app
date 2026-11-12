import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { ChatMessage } from "./chat-message.entity.js";
import { User } from "./user.entity.js";

@Entity("chat_conversations")
@Index("chat_conversations_last_message_at", ["lastMessageAt"])
@Index("chat_conversations_last_message_id_idx", ["lastMessageId"])
export class ChatConversation {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer", unique: true })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "integer", nullable: true })
  lastMessageId!: number | null;

  @ManyToOne(() => ChatMessage, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "last_message_id" })
  lastMessage!: Relation<ChatMessage> | null;

  @Column({ type: "timestamptz", nullable: true })
  lastMessageAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastChangeAt!: Date | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
