import {
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { adminKeyId,GeneratedId } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { ChatConversation } from "./chat-conversation.entity.js";

@Entity("chat_reads")
@ForeignKey(() => Admin, ["readerAdminId"], ["id"], {
  name: "fk_chat_reads_reader_admin_id",
  onDelete: "CASCADE",
})
@Index("chat_reads_reader_admin_id_idx", ["readerAdminId"], {
  where: `"reader_admin_id" IS NOT NULL`,
})
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

  @GeneratedId(adminKeyId("reader_key"))
  readerAdminId!: number | null;
}
