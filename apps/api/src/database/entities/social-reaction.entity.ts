import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { SocialPost } from "./social-post.entity.js";

@Entity("social_reactions")
export class SocialReaction {
  @PrimaryColumn({ type: "integer" })
  postId!: number;

  @ManyToOne(() => SocialPost, { onDelete: "CASCADE" })
  @JoinColumn({ name: "post_id" })
  post!: Relation<SocialPost>;

  @PrimaryColumn({ type: "text" })
  reactorKey!: string;

  @Column({ type: "text" })
  emoji!: string;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
