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
import { ChatGroupMessage } from "./chat-group-message.entity.js";

// Photos sent in a group, stored like chat_photos: pending (message_id NULL)
// from the upload until a message carries it; unsend deletes the bytes. A
// message carries up to 10 photos ordered by position (0 = cover, also the
// message's photo_id; NULL counts as 0).
//
// uploader_key has no foreign key: an attached photo stays when its uploader's
// account is deleted (the old member delete removed only pending uploads).
@Entity("chat_group_photos")
@Check("chat_group_photos_uploader_key_format", socialKeyCheck("uploader_key"))
@Check("chat_group_photos_size_matches_data", `"size" = octet_length("data")`)
@Check(
  "chat_group_photos_position_nonnegative",
  `"position" IS NULL OR "position" >= 0`,
)
@Check(`"mime" IN ('image/webp', 'image/jpeg', 'image/png')`)
// Unique so that chat_group_messages (id, photo_id) can reference it.
@Index("chat_group_photos_message_photo", ["messageId", "id"], {
  unique: true,
})
@Index("chat_group_photos_message_position", ["messageId", "position"], {
  unique: true,
  where: `"message_id" IS NOT NULL AND "position" IS NOT NULL`,
})
// The message is one of this group's. Deferred: the app attaches the photo
// (message_id) before the message points back (photo_id). Deleting the
// message deletes its photos.
@ForeignKey(
  () => ChatGroupMessage,
  ["groupId", "messageId"],
  ["groupId", "id"],
  {
    name: "fk_chat_group_photos_message",
    onDelete: "CASCADE",
    deferrable: "INITIALLY DEFERRED",
  },
)
@Index("chat_group_photos_group", ["groupId"])
@Index("chat_group_photos_uploader_key_idx", ["uploaderKey"])
export class ChatGroupPhoto {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  groupId!: number;

  @ManyToOne(() => ChatGroup, { onDelete: "CASCADE" })
  @JoinColumn({ name: "group_id" })
  group!: Relation<ChatGroup>;

  @Column({ type: "integer", nullable: true })
  messageId!: number | null;

  @Column({ type: "text" })
  uploaderKey!: string;

  @Column({ type: "integer", nullable: true })
  position!: number | null;

  @Column({ type: "text" })
  mime!: "image/webp" | "image/jpeg" | "image/png";

  @Column({ type: "integer" })
  width!: number;

  @Column({ type: "integer" })
  height!: number;

  @Column({ type: "bytea" })
  data!: Buffer;

  @Column({ type: "integer" })
  size!: number;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
