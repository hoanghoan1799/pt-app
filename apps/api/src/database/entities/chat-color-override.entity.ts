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

@Entity("chat_color_overrides")
@Index("chat_color_overrides_admin_id_idx", ["adminId"])
export class ChatColorOverride {
  @PrimaryColumn({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => ChatConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<ChatConversation>;

  @PrimaryColumn({ type: "integer" })
  adminId!: number;

  @ManyToOne(() => Admin, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admin_id" })
  admin!: Relation<Admin>;

  @Column({ type: "text" })
  color!: string;
}
