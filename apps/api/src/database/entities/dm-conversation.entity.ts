import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { DmMessage } from "./dm-message.entity.js";
import { User } from "./user.entity.js";

@Entity("dm_conversations")
// user_low < user_high: one canonical pair per two people.
@Check("dm_conversations_users_ordered", `"user_low" < "user_high"`)
// Same rules as chat_conversations. Hard-deleting a trainee removes their DM
// conversations for BOTH sides (user_low / user_high CASCADE): the current
// product behaviour.
@ForeignKey(
  () => DmMessage,
  ["id", "lastMessageId"],
  ["conversationId", "id"],
  { name: "fk_dm_conversations_last_message", onDelete: "SET NULL" },
)
@Index("dm_conversations_pair", ["userLow", "userHigh"], { unique: true })
@Index("dm_conversations_high", ["userHigh"])
@Index("dm_conversations_last_message_id_idx", ["lastMessageId"])
export class DmConversation {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  userLow!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_low" })
  userLowRef!: Relation<User>;

  @Column({ type: "integer" })
  userHigh!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_high" })
  userHighRef!: Relation<User>;

  @Column({ type: "integer", nullable: true })
  lastMessageId!: number | null;

  @Column({ type: "timestamptz", nullable: true })
  lastMessageAt!: Date | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
