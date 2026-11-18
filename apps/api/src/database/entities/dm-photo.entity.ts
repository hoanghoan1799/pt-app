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

import { DmConversation } from "./dm-conversation.entity.js";
import { DmMessage } from "./dm-message.entity.js";
import { User } from "./user.entity.js";

@Entity("dm_photos")
@Index("dm_photos_message_photo", ["messageId", "id"], { unique: true })
// Up to 10 photos per message; position is the order (0 = cover, also
// dm_messages.photo_id).
@ForeignKey(() => DmMessage, ["messageId"], ["id"], {
  name: "fk_dm_photos_message",
  onDelete: "CASCADE",
  deferrable: "INITIALLY DEFERRED",
})
@Check(
  "dm_photos_position_nonnegative",
  `"position" IS NULL OR "position" >= 0`,
)
@Index("dm_photos_message_position", ["messageId", "position"], {
  unique: true,
  where: `"message_id" IS NOT NULL AND "position" IS NOT NULL`,
})
@Check("dm_photos_size_matches_data", `"size" = octet_length("data")`)
@Index("dm_photos_conversation", ["conversationId"])
@Check(`"mime" IN ('image/webp', 'image/jpeg', 'image/png')`)
@Index("dm_photos_uploader_id_idx", ["uploaderId"])
export class DmPhoto {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => DmConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<DmConversation>;

  @Column({ type: "integer", nullable: true })
  messageId!: number | null;

  @Column({ type: "integer" })
  uploaderId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "uploader_id" })
  uploader!: Relation<User>;

  // Order inside the message (0 = cover); null counts as 0.
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
