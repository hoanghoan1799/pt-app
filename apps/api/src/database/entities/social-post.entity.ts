import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import { GeneratedId, kindId } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { SocialPostPhoto } from "./social-post-photo.entity.js";
import { User } from "./user.entity.js";

@Entity("social_posts")
@Check("social_posts_author_id_positive", `"author_id" > 0`)
@ForeignKey(() => User, ["authorUserId"], ["id"], {
  name: "fk_social_posts_author_user_id",
  onDelete: "CASCADE",
})
@Index("social_posts_author_user_id_idx", ["authorUserId"], {
  where: `"author_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["authorAdminId"], ["id"], {
  name: "fk_social_posts_author_admin_id",
  onDelete: "CASCADE",
})
@Index("social_posts_author_admin_id_idx", ["authorAdminId"], {
  where: `"author_admin_id" IS NOT NULL`,
})
@Index("social_posts_author", ["authorKind", "authorId", "createdAt"])
@Check(`"author_kind" IN ('user', 'admin')`)
@Check(`"privacy" IN ('everyone', 'friends', 'only_me')`)
@Index("social_posts_photo_id_idx", ["photoId"])
@Index("social_posts_id_photo", ["id", "photoId"], { unique: true })
// post.photo_id and photo.post_id agree (see ChatMessage for the pattern).
@ForeignKey(() => SocialPostPhoto, ["id", "photoId"], ["postId", "id"], {
  name: "fk_social_posts_photo",
  onDelete: "SET NULL",
  deferrable: "INITIALLY DEFERRED",
})
@Index(
  "social_posts_idempotency",
  ["authorKind", "authorId", "idempotencyKey"],
  { unique: true, where: `"idempotency_key" IS NOT NULL` },
)
export class SocialPost {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  authorKind!: "user" | "admin";

  @Column({ type: "integer" })
  authorId!: number;

  @Column({ type: "text", nullable: true })
  caption!: string | null;

  @Column({ type: "text" })
  privacy!: "everyone" | "friends" | "only_me";

  @Column({ type: "integer", nullable: true })
  photoId!: number | null;

  // `Idempotency-Key` header of the create request: a retry with the same key
  // returns this post instead of making another.
  @Column({ type: "text", nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "timestamptz" })
  updatedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @GeneratedId(kindId("author_kind", "author_id", "user"))
  authorUserId!: number | null;

  @GeneratedId(kindId("author_kind", "author_id", "admin"))
  authorAdminId!: number | null;
}
