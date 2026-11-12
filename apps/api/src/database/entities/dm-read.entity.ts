import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { DmConversation } from "./dm-conversation.entity.js";
import { User } from "./user.entity.js";

@Entity("dm_reads")
@Index("dm_reads_user_id_idx", ["userId"])
export class DmRead {
  @PrimaryColumn({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => DmConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<DmConversation>;

  @PrimaryColumn({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "integer", default: 0 })
  lastReadMessageId!: number;
}
