import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { ChatConversation } from "./chat-conversation.entity.js";

@Entity("chat_reads")
export class ChatRead {
  @PrimaryColumn({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => ChatConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<ChatConversation>;

  @PrimaryColumn({ type: "text" })
  readerKey!: string;

  @Column({ type: "integer", default: 0 })
  lastReadMessageId!: number;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
