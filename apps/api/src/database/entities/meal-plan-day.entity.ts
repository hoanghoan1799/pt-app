import {
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

@Entity("meal_plan_days")
// The target of meal_plan_meals' composite foreign key (the meal carries its
// day's owner).
@Unique("meal_plan_days_id_user_key", ["id", "userId"])
@Index("meal_plan_days_user_date", ["userId", "date"], { unique: true })
export class MealPlanDay {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "date" })
  date!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
