import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { SocialPost } from "./social-post.entity.js";

@Entity("social_comments")
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
}
