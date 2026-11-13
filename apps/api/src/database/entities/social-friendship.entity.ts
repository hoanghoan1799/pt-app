import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { User } from "./user.entity.js";

@Entity("social_friendships")
@Check("social_friendships_users_ordered", `"user_low" < "user_high"`)
@Check(
  "social_friendships_requested_by_member",
  `"requested_by" IN ("user_low", "user_high")`,
)
@Index("social_friendships_high", ["userHigh"])
@Check(`"status" IN ('pending', 'accepted')`)
@Index("social_friendships_requested_by_idx", ["requestedBy"])
export class SocialFriendship {
  @PrimaryColumn({ type: "integer" })
  userLow!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_low" })
  userLowRef!: Relation<User>;

  @PrimaryColumn({ type: "integer" })
  userHigh!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_high" })
  userHighRef!: Relation<User>;

  @Column({ type: "text" })
  status!: "pending" | "accepted";

  @Column({ type: "integer" })
  requestedBy!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requested_by" })
  requestedByRef!: Relation<User>;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  acceptedAt!: Date | null;
}
