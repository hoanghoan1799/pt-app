import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { DmMessage } from "./dm-message.entity.js";
import { User } from "./user.entity.js";

@Entity("dm_conversations")
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

  @ManyToOne(() => DmMessage, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "last_message_id" })
  lastMessage!: Relation<DmMessage> | null;

  @Column({ type: "timestamptz", nullable: true })
  lastMessageAt!: Date | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
