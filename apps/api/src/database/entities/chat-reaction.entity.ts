import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { ChatMessage } from "./chat-message.entity.js";

@Entity("chat_reactions")
export class ChatReaction {
  @PrimaryColumn({ type: "integer" })
  messageId!: number;

  @ManyToOne(() => ChatMessage, { onDelete: "CASCADE" })
  @JoinColumn({ name: "message_id" })
  message!: Relation<ChatMessage>;

  @PrimaryColumn({ type: "text" })
  reactorKey!: string;

  @Column({ type: "text" })
  emoji!: string;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
