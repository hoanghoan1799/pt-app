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
import { ChatGroup } from "./chat-group.entity.js";
import { ChatGroupPhoto } from "./chat-group-photo.entity.js";

// A group message or a system line. The id is monotonic and doubles as the
// poll cursor. Messages stay when the sender's account is deleted ("Deleted
// member"), so sender_key, hidden_by_key have a format CHECK but no foreign key.
@Entity("chat_group_messages")
@Check(`"kind" IN ('message', 'system')`)
@Check(`"audience" IN ('super_admin')`)
@Check("chat_group_messages_sender_key_format", socialKeyCheck("sender_key"))
@Check(
  "chat_group_messages_hidden_by_key_format",
  socialKeyCheck("hidden_by_key"),
)
// A system line has no sender, a message always has one.
@Check(
  "chat_group_messages_sender_matches_kind",
  `("kind" = 'system') = ("sender_key" IS NULL)`,
)
// Hide sets both, unhide clears both.
@Check(
  "chat_group_messages_hidden_pair",
  `("hidden_by_key" IS NULL) = ("hidden_at" IS NULL)`,
)
// Unique so that a reply, last_message_id, a photo and a member's read cursor
// can reference the pair (group_id, id): all must name a message of the same
// group.
@Index("chat_group_messages_group_id", ["groupId", "id"], { unique: true })
// Unique only so that chat_group_photos can be referenced by (id, photo_id).
@Index("chat_group_messages_id_photo", ["id", "photoId"], { unique: true })
// A retried send by the same sender is a no-op; another member may use the
// same client id (as chat_messages / dm_messages since DbIntegrity). System
// lines have no sender and no client id (NULLs differ).
@Index(
  "chat_group_messages_group_sender_client",
  ["groupId", "senderKey", "clientId"],
  { unique: true },
)
@ForeignKey(
  () => ChatGroupMessage,
  ["groupId", "replyToMessageId"],
  ["groupId", "id"],
  { name: "fk_chat_group_messages_reply_in_group", onDelete: "SET NULL" },
)
// photo_id is the cover (position 0) of the message's photos: a photo attached
// to this very message. Deferred to COMMIT (the app attaches the photos
// first). Deleting the photo clears photo_id only.
@ForeignKey(() => ChatGroupPhoto, ["id", "photoId"], ["messageId", "id"], {
  name: "fk_chat_group_messages_photo",
  onDelete: "SET NULL",
  deferrable: "INITIALLY DEFERRED",
})
@Index("chat_group_messages_reply_to_message_id_idx", ["replyToMessageId"])
@Index("chat_group_messages_photo_id_idx", ["photoId"])
@Index("chat_group_messages_sender_key_idx", ["senderKey"])
export class ChatGroupMessage {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  groupId!: number;

  @ManyToOne(() => ChatGroup, { onDelete: "CASCADE" })
  @JoinColumn({ name: "group_id" })
  group!: Relation<ChatGroup>;

  @Column({ type: "text" })
  kind!: "message" | "system";

  // "user:<id>" | "admin:<id>"; NULL for system lines.
  @Column({ type: "text", nullable: true })
  senderKey!: string | null;

  @Column({ type: "text", default: "" })
  body!: string;

  // JSON of a system line, validated by Zod on write and read.
  @Column({ type: "text", nullable: true })
  systemEvent!: string | null;

  // Set only on the PT-change alert: only super admins may read the row.
  @Column({ type: "text", nullable: true })
  audience!: "super_admin" | null;

  @Column({ type: "text", nullable: true })
  clientId!: string | null;

  @Column({ type: "integer", nullable: true })
  replyToMessageId!: number | null;

  @Column({ type: "text", nullable: true })
  stickerRef!: string | null;

  // Kept next to sticker_ref: the message keeps rendering a deleted sticker.
  @Column({ type: "text", nullable: true })
  stickerUrl!: string | null;

  @Column({ type: "integer", nullable: true })
  photoId!: number | null;

  // false = a normal message (SQLite: NULL meant the same).
  @Column({ type: "boolean", default: false })
  silent!: boolean;

  @Column({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  hiddenByKey!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  hiddenAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  editedAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  updatedAt!: Date | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
