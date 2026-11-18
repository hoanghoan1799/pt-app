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

import { socialKeyCheck } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { ChatGroupMessage } from "./chat-group-message.entity.js";

// Group chat (company/main docs/specs/group-chat.md): a named chat of trainees,
// PTs and every super admin. SQLite had no foreign keys on the group tables;
// PostgreSQL adds them where the old code cleaned up by hand.
@Entity("chat_groups")
// 1..60 characters after trim (GROUP_NAME_MIN_LENGTH / MAX_LENGTH); the app
// stores the trimmed name.
@Check("chat_groups_name_length", `char_length("name") BETWEEN 1 AND 60`)
// "admin:<id>" of the creator (the social key form). No foreign key: it
// dangles on purpose once that PT account is deleted (only super admins
// manage the group then).
@Check("chat_groups_created_by_key_format", socialKeyCheck("created_by_key"))
@Check(
  "chat_groups_dissolved_by_needs_dissolved_at",
  `"dissolved_by_admin_id" IS NULL OR "dissolved_at" IS NOT NULL`,
)
// The last message belongs to this group. Deleting it only clears
// last_message_id. last_message_id / last_message_at are denormalised and kept
// by the app.
@ForeignKey(
  () => ChatGroupMessage,
  ["id", "lastMessageId"],
  ["groupId", "id"],
  { name: "fk_chat_groups_last_message", onDelete: "SET NULL" },
)
@Index("chat_groups_dissolved_last_message", ["dissolvedAt", "lastMessageAt"])
@Index("chat_groups_last_message_id_idx", ["lastMessageId"])
@Index("chat_groups_dissolved_by_admin_id_idx", ["dissolvedByAdminId"])
export class ChatGroup {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  name!: string;

  // Group photo: a 256x256 data URL, versioned by avatar_updated_at like the
  // account avatars were in SQLite. NULL = initials.
  @Column({ type: "text", nullable: true })
  avatar!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  avatarUpdatedAt!: Date | null;

  @Column({ type: "text" })
  createdByKey!: string;

  // false = everyone can send (SQLite: NULL meant the same).
  @Column({ type: "boolean", default: false })
  managersOnly!: boolean;

  @Column({ type: "integer", nullable: true })
  lastMessageId!: number | null;

  @Column({ type: "timestamptz", nullable: true })
  lastMessageAt!: Date | null;

  // Bumped by every edit, unsend, reaction and hide: the polling cursor.
  @Column({ type: "timestamptz", nullable: true })
  lastChangeAt!: Date | null;

  // Soft dissolve (super admin): the data stays, the group leaves every list.
  @Column({ type: "timestamptz", nullable: true })
  dissolvedAt!: Date | null;

  @Column({ type: "integer", nullable: true })
  dissolvedByAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "dissolved_by_admin_id" })
  dissolvedByAdmin!: Relation<Admin> | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
