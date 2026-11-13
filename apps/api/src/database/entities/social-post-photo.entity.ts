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

import {
  adminKeyId,
  GeneratedId,
  socialKeyCheck,
  userKeyId,
} from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { SocialPost } from "./social-post.entity.js";
import { User } from "./user.entity.js";

@Entity("social_post_photos")
@Check("social_post_photos_uploader_key_format", socialKeyCheck("uploader_key"))
@Index("social_post_photos_uploader_key_idx", ["uploaderKey"])
@ForeignKey(() => User, ["uploaderUserId"], ["id"], {
  name: "fk_social_post_photos_uploader_user_id",
  onDelete: "CASCADE",
})
@Index("social_post_photos_uploader_user_id_idx", ["uploaderUserId"], {
  where: `"uploader_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["uploaderAdminId"], ["id"], {
  name: "fk_social_post_photos_uploader_admin_id",
  onDelete: "CASCADE",
})
@Index("social_post_photos_uploader_admin_id_idx", ["uploaderAdminId"], {
  where: `"uploader_admin_id" IS NOT NULL`,
})
@Index("social_post_photos_post", ["postId"])
@Check(`"mime" IN ('image/webp', 'image/jpeg', 'image/png')`)
export class SocialPostPhoto {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  uploaderKey!: string;

  @Column({ type: "integer", nullable: true })
  postId!: number | null;

  @ManyToOne(() => SocialPost, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "post_id" })
  post!: Relation<SocialPost> | null;

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

  @GeneratedId(userKeyId("uploader_key"))
  uploaderUserId!: number | null;

  @GeneratedId(adminKeyId("uploader_key"))
  uploaderAdminId!: number | null;
}
