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

@Entity("chat_message_edits")
@Index("chat_message_edits_message_id", ["messageId"])
export class ChatMessageEdit {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  messageId!: number;

  @ManyToOne(() => ChatMessage, { onDelete: "CASCADE" })
  @JoinColumn({ name: "message_id" })
  message!: Relation<ChatMessage>;

  @Column({ type: "text" })
  previousBody!: string;

  @Column({ type: "timestamptz" })
  editedAt!: Date;
}
