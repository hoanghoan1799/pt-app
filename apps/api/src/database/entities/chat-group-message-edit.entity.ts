import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { ChatGroupMessage } from "./chat-group-message.entity.js";

// The previous bodies of an edited group message.
@Entity("chat_group_message_edits")
@Index("chat_group_message_edits_message", ["messageId"])
export class ChatGroupMessageEdit {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  messageId!: number;

  @ManyToOne(() => ChatGroupMessage, { onDelete: "CASCADE" })
  @JoinColumn({ name: "message_id" })
  message!: Relation<ChatGroupMessage>;

  @Column({ type: "text" })
  previousBody!: string;

  @Column({ type: "timestamptz" })
  editedAt!: Date;
}
