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

import {
  adminKeyId,
  GeneratedId,
  socialKeyCheck,
  userKeyId,
} from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { ChatGroupMessage } from "./chat-group-message.entity.js";
import { User } from "./user.entity.js";

// One reaction per reactor per message. Goes with the message and with the
// reactor's account (the old member and admin deletes removed it by hand).
@Entity("chat_group_reactions")
@Check("chat_group_reactions_reactor_key_format", socialKeyCheck("reactor_key"))
@ForeignKey(() => User, ["reactorUserId"], ["id"], {
  name: "fk_chat_group_reactions_reactor_user_id",
  onDelete: "CASCADE",
})
@ForeignKey(() => Admin, ["reactorAdminId"], ["id"], {
  name: "fk_chat_group_reactions_reactor_admin_id",
  onDelete: "CASCADE",
})
@Index("chat_group_reactions_reactor_user_id_idx", ["reactorUserId"], {
  where: `"reactor_user_id" IS NOT NULL`,
})
@Index("chat_group_reactions_reactor_admin_id_idx", ["reactorAdminId"], {
  where: `"reactor_admin_id" IS NOT NULL`,
})
export class ChatGroupReaction {
  @PrimaryColumn({ type: "integer" })
  messageId!: number;

  @ManyToOne(() => ChatGroupMessage, { onDelete: "CASCADE" })
  @JoinColumn({ name: "message_id" })
  message!: Relation<ChatGroupMessage>;

  @PrimaryColumn({ type: "text" })
  reactorKey!: string;

  @Column({ type: "text" })
  emoji!: string;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @GeneratedId(userKeyId("reactor_key"))
  reactorUserId!: number | null;

  @GeneratedId(adminKeyId("reactor_key"))
  reactorAdminId!: number | null;
}
