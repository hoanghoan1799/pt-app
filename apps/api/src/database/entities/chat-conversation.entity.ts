import {
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { ChatMessage } from "./chat-message.entity.js";
import { User } from "./user.entity.js";

@Entity("chat_conversations")
// The last message belongs to this conversation. Deleting it only clears
// last_message_id. last_message_id / last_message_at are denormalised and kept
// by the app (ChatService.send); data:verify recomputes and compares them.
@ForeignKey(
  () => ChatMessage,
  ["id", "lastMessageId"],
  ["conversationId", "id"],
  { name: "fk_chat_conversations_last_message", onDelete: "SET NULL" },
)
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

  @Column({ type: "timestamptz", nullable: true })
  lastMessageAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastChangeAt!: Date | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
