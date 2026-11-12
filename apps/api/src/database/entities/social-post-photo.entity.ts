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

@Entity("social_post_photos")
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
}
