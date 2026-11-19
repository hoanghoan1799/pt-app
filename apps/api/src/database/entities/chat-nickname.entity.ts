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
  chatKeyCheck,
  chatNicknameTargetCheck,
  GeneratedId,
} from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { ChatConversation } from "./chat-conversation.entity.js";

const NICKNAME_CONTROL = "\\u0000-\\u001f\\u007f-\\u009f";
const NICKNAME_SPACE =
  " \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
const NICKNAME_WORD = `[^${NICKNAME_CONTROL}${NICKNAME_SPACE}]+`;
const NICKNAME_PATTERN = `^${NICKNAME_WORD}( ${NICKNAME_WORD})*$`;

// Same expression as the ChatNicknameValue migration (a test compares them;
// migration:check only compares CHECK names).
export const CHAT_NICKNAME_VALUE_CHECK = `char_length("nickname") BETWEEN 1 AND 30 AND "nickname" ~ '${NICKNAME_PATTERN}'`;

// The shared nickname of one member of a conversation (Messenger style): every
// member sees the same one. `target_key` is "user" (the conversation's
// trainee), "pt" (the PT side as a whole) or "admin:<id>"; `set_by_key` is
// "user" or "admin:<id>". A cleared nickname has no row. The nickname is what
// the API's schema stores: trimmed, single spaces, no control characters, 1 to
// 30 characters (ChatNicknameValue spells out the character classes).
//
// Only the target admin is a real FK (the nickname goes with that admin). The
// setter is a plain, format-checked key on purpose: removing the admin who
// typed a nickname must not erase what somebody else is called.
@Entity("chat_nicknames")
@Check(
  "chat_nicknames_target_key_format",
  chatNicknameTargetCheck("target_key"),
)
@Check("chat_nicknames_set_by_key_format", chatKeyCheck("set_by_key"))
@Check("chat_nicknames_nickname_value", CHAT_NICKNAME_VALUE_CHECK)
@ForeignKey(() => Admin, ["targetAdminId"], ["id"], {
  name: "fk_chat_nicknames_target_admin_id",
  onDelete: "CASCADE",
})
@Index("chat_nicknames_target_admin_id_idx", ["targetAdminId"], {
  where: `"target_admin_id" IS NOT NULL`,
})
export class ChatNickname {
  @PrimaryColumn({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => ChatConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<ChatConversation>;

  @PrimaryColumn({ type: "text" })
  targetKey!: string;

  @Column({ type: "text" })
  nickname!: string;

  @Column({ type: "text" })
  setByKey!: string;

  @Column({ type: "timestamptz" })
  updatedAt!: Date;

  @GeneratedId(adminKeyId("target_key"))
  targetAdminId!: number | null;
}
