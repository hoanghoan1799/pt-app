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
import { ChatGroup } from "./chat-group.entity.js";
import { ChatGroupMessage } from "./chat-group-message.entity.js";
import { User } from "./user.entity.js";

// Explicit members plus lazy state rows of super admins (mute, read cursor).
// The row goes with the group and with the member's account (the old member
// and admin deletes removed it by hand).
@Entity("chat_group_members")
@Check("chat_group_members_member_key_format", socialKeyCheck("member_key"))
@Check("chat_group_members_added_by_key_format", socialKeyCheck("added_by_key"))
@Check(
  "chat_group_members_removed_by_key_format",
  socialKeyCheck("removed_by_key"),
)
@Check(
  "chat_group_members_removed_needs_left_at",
  `"removed_by_key" IS NULL OR "left_at" IS NOT NULL`,
)
@Check(
  "chat_group_members_last_read_nonnegative",
  `"last_read_message_id" >= 0`,
)
// The read cursor is a message of this group. Deleting that message clears
// only the cursor (SET NULL (last_read_message_id)), never group_id. The
// primary key, led by group_id, serves the lookup.
@ForeignKey(
  () => ChatGroupMessage,
  ["groupId", "lastReadMessageId"],
  ["groupId", "id"],
  { name: "fk_chat_group_members_last_read", onDelete: "SET NULL" },
)
@ForeignKey(() => User, ["memberUserId"], ["id"], {
  name: "fk_chat_group_members_member_user_id",
  onDelete: "CASCADE",
})
@ForeignKey(() => Admin, ["memberAdminId"], ["id"], {
  name: "fk_chat_group_members_member_admin_id",
  onDelete: "CASCADE",
})
@Index("chat_group_members_member", ["memberKey", "leftAt"])
@Index("chat_group_members_member_user_id_idx", ["memberUserId"], {
  where: `"member_user_id" IS NOT NULL`,
})
@Index("chat_group_members_member_admin_id_idx", ["memberAdminId"], {
  where: `"member_admin_id" IS NOT NULL`,
})
export class ChatGroupMember {
  @PrimaryColumn({ type: "integer" })
  groupId!: number;

  @ManyToOne(() => ChatGroup, { onDelete: "CASCADE" })
  @JoinColumn({ name: "group_id" })
  group!: Relation<ChatGroup>;

  // "user:<id>" | "admin:<id>".
  @PrimaryColumn({ type: "text" })
  memberKey!: string;

  // Who added the member. No foreign key: the adder's account may be gone.
  @Column({ type: "text" })
  addedByKey!: string;

  @Column({ type: "timestamptz" })
  joinedAt!: Date;

  // removed_by_key NULL + left_at set = the member left on their own.
  @Column({ type: "timestamptz", nullable: true })
  leftAt!: Date | null;

  @Column({ type: "text", nullable: true })
  removedByKey!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  mutedAt!: Date | null;

  // NULL = nothing read yet; otherwise a message of this group. Unread is
  // id > cursor with NULL as 0. Write paths (mark read, join, re-add) store
  // NULL or an id of this group, never 0 (the foreign key refuses 0 and any
  // other group's id); an API that answers a number maps NULL to 0.
  @Column({ type: "integer", nullable: true })
  lastReadMessageId!: number | null;

  @GeneratedId(userKeyId("member_key"))
  memberUserId!: number | null;

  @GeneratedId(adminKeyId("member_key"))
  memberAdminId!: number | null;
}
