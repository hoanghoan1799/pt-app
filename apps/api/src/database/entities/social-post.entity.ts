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

import { SocialPostPhoto } from "./social-post-photo.entity.js";

@Entity("social_posts")
@Index("social_posts_author", ["authorKind", "authorId", "createdAt"])
@Check(`"author_kind" IN ('user', 'admin')`)
@Check(`"privacy" IN ('everyone', 'friends', 'only_me')`)
@Index("social_posts_photo_id_idx", ["photoId"])
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

  @ManyToOne(() => SocialPostPhoto, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "photo_id" })
  photo!: Relation<SocialPostPhoto> | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "timestamptz" })
  updatedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
