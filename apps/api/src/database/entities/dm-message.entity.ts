import {
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
import { DmPhoto } from "./dm-photo.entity.js";
import { SocialPost } from "./social-post.entity.js";
import { User } from "./user.entity.js";

@Entity("dm_messages")
@Index(
  "dm_messages_conversation_sender_client",
  ["conversationId", "senderId", "clientId"],
  { unique: true },
)
@Index("dm_messages_conversation_id", ["conversationId", "id"], {
  unique: true,
})
@Index("dm_messages_id_photo", ["id", "photoId"], { unique: true })
@ForeignKey(() => DmPhoto, ["id", "photoId"], ["messageId", "id"], {
  name: "fk_dm_messages_photo",
  onDelete: "SET NULL",
})
@Index("dm_messages_sender_id_idx", ["senderId"])
@Index("dm_messages_photo_id_idx", ["photoId"])
@Index("dm_messages_reply_post_id_idx", ["replyPostId"])
export class DmMessage {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  conversationId!: number;

  @ManyToOne(() => DmConversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation!: Relation<DmConversation>;

  @Column({ type: "integer" })
  senderId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sender_id" })
  sender!: Relation<User>;

  @Column({ type: "text", nullable: true })
  body!: string | null;

  @Column({ type: "integer", nullable: true })
  photoId!: number | null;

  @Column({ type: "integer", nullable: true })
  replyPostId!: number | null;

  @ManyToOne(() => SocialPost, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "reply_post_id" })
  replyPost!: Relation<SocialPost> | null;

  @Column({ type: "text" })
  clientId!: string;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
