import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from "typeorm";

import { User } from "./user.entity.js";

@Entity("workout_days")
// The target of the composite foreign keys that make a child row agree with the
// day on its owner (exercises.user_id).
@Unique("workout_days_id_user_key", ["id", "userId"])
@Index("workout_days_user_date", ["userId", "date"], { unique: true })
@Check(`"source" IN ('manual', 'tdee')`)
export class WorkoutDay {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "date" })
  date!: string;

  @Column({ type: "text", default: "" })
  title!: string;

  @Column({ type: "text", default: "" })
  note!: string;

  @Column({ type: "text", default: "manual" })
  source!: "manual" | "tdee";

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
