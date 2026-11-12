import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { ChatConversation } from "./chat-conversation.entity.js";

@Entity("chat_nicknames")
export class ChatNickname {
  @PrimaryColumn({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => ChatConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<ChatConversation>;

  @PrimaryColumn({ type: "text" })
  targetKey!: string;

  @Column({ type: "text" })
  nickname!: string;

  @Column({ type: "text" })
  setByKey!: string;

  @Column({ type: "timestamptz" })
  updatedAt!: Date;
}
