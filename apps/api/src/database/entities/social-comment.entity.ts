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

import { adminKeyId,GeneratedId, userKeyId } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { SocialPost } from "./social-post.entity.js";
import { User } from "./user.entity.js";

@Entity("social_comments")
// Account deletion (SocialCleanupService) looks content up by the text key.
@Index("social_comments_author_key_idx", ["authorKey"])
@ForeignKey(() => User, ["authorUserId"], ["id"], {
  name: "fk_social_comments_author_user_id",
  onDelete: "CASCADE",
})
@Index("social_comments_author_user_id_idx", ["authorUserId"], {
  where: `"author_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["authorAdminId"], ["id"], {
  name: "fk_social_comments_author_admin_id",
  onDelete: "CASCADE",
})
@Index("social_comments_author_admin_id_idx", ["authorAdminId"], {
  where: `"author_admin_id" IS NOT NULL`,
})
@Index("social_comments_post", ["postId", "createdAt"])
export class SocialComment {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  postId!: number;

  @ManyToOne(() => SocialPost, { onDelete: "CASCADE" })
  @JoinColumn({ name: "post_id" })
  post!: Relation<SocialPost>;

  @Column({ type: "text" })
  authorKey!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  updatedAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @GeneratedId(userKeyId("author_key"))
  authorUserId!: number | null;

  @GeneratedId(adminKeyId("author_key"))
  authorAdminId!: number | null;
}
