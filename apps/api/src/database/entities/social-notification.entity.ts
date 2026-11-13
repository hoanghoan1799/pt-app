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

import { adminKeyId,GeneratedId, userKeyId } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { SocialPost } from "./social-post.entity.js";
import { User } from "./user.entity.js";

@Entity("social_notifications")
@Index("social_notifications_actor_key_idx", ["actorKey"])
@ForeignKey(() => User, ["recipientUserId"], ["id"], {
  name: "fk_social_notifications_recipient_user_id",
  onDelete: "CASCADE",
})
@Index("social_notifications_recipient_user_id_idx", ["recipientUserId"], {
  where: `"recipient_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["recipientAdminId"], ["id"], {
  name: "fk_social_notifications_recipient_admin_id",
  onDelete: "CASCADE",
})
@Index("social_notifications_recipient_admin_id_idx", ["recipientAdminId"], {
  where: `"recipient_admin_id" IS NOT NULL`,
})
@ForeignKey(() => User, ["actorUserId"], ["id"], {
  name: "fk_social_notifications_actor_user_id",
  onDelete: "CASCADE",
})
@Index("social_notifications_actor_user_id_idx", ["actorUserId"], {
  where: `"actor_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["actorAdminId"], ["id"], {
  name: "fk_social_notifications_actor_admin_id",
  onDelete: "CASCADE",
})
@Index("social_notifications_actor_admin_id_idx", ["actorAdminId"], {
  where: `"actor_admin_id" IS NOT NULL`,
})
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

  @GeneratedId(userKeyId("recipient_key"))
  recipientUserId!: number | null;

  @GeneratedId(adminKeyId("recipient_key"))
  recipientAdminId!: number | null;

  @GeneratedId(userKeyId("actor_key"))
  actorUserId!: number | null;

  @GeneratedId(adminKeyId("actor_key"))
  actorAdminId!: number | null;
}
