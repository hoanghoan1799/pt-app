import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { adminKeyId, chatKeyCheck,GeneratedId } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { ChatMessage } from "./chat-message.entity.js";

@Entity("chat_reactions")
@Check("chat_reactions_reactor_key_format", chatKeyCheck("reactor_key"))
@ForeignKey(() => Admin, ["reactorAdminId"], ["id"], {
  name: "fk_chat_reactions_reactor_admin_id",
  onDelete: "CASCADE",
})
@Index("chat_reactions_reactor_admin_id_idx", ["reactorAdminId"], {
  where: `"reactor_admin_id" IS NOT NULL`,
})
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

  @GeneratedId(adminKeyId("reactor_key"))
  reactorAdminId!: number | null;
}
