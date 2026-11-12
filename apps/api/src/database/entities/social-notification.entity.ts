import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { SocialPost } from "./social-post.entity.js";

@Entity("social_notifications")
@Index("social_notifications_recipient", ["recipientKey", "createdAt"])
@Check(
  `"kind" IN ('friend_request', 'friend_accepted', 'post_reaction', 'post_comment', 'admin_post')`,
)
@Index("social_notifications_post_id_idx", ["postId"])
export class SocialNotification {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  recipientKey!: string;

  @Column({ type: "text" })
  kind!:
    | "friend_request"
    | "friend_accepted"
    | "post_reaction"
    | "post_comment"
    | "admin_post";

  @Column({ type: "text" })
  actorKey!: string;

  @Column({ type: "integer", nullable: true })
  postId!: number | null;

  @ManyToOne(() => SocialPost, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "post_id" })
  post!: Relation<SocialPost> | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  pushedAt!: Date | null;
}
