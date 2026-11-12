import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { Admin } from "./admin.entity.js";
import { ChatConversation } from "./chat-conversation.entity.js";

@Entity("chat_hidden_conversations")
@Index("chat_hidden_conversations_conversation_id_idx", ["conversationId"])
export class ChatHiddenConversation {
  @PrimaryColumn({ type: "integer" })
  adminId!: number;

  @ManyToOne(() => Admin, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admin_id" })
  admin!: Relation<Admin>;

  @PrimaryColumn({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => ChatConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<ChatConversation>;

  @Column({ type: "timestamptz", default: () => "now()" })
  hiddenAt!: Date;
}
