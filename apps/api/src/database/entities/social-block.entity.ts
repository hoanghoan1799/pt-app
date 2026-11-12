import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { User } from "./user.entity.js";

@Entity("social_blocks")
@Index("social_blocks_blocked", ["blockedId"])
export class SocialBlock {
  @PrimaryColumn({ type: "integer" })
  blockerId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "blocker_id" })
  blocker!: Relation<User>;

  @PrimaryColumn({ type: "integer" })
  blockedId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "blocked_id" })
  blocked!: Relation<User>;

  @Column({ type: "timestamptz" })
  createdAt!: Date;
}
