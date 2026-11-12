import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { MealPlanMeal } from "./meal-plan-meal.entity.js";
import { User } from "./user.entity.js";

@Entity("meal_marks")
@Index("meal_marks_user_id_idx", ["userId"])
export class MealMark {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer", unique: true })
  mealId!: number;

  @ManyToOne(() => MealPlanMeal, { onDelete: "CASCADE" })
  @JoinColumn({ name: "meal_id" })
  meal!: Relation<MealPlanMeal>;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "boolean", default: false })
  achieved!: boolean;

  @Column({ type: "text", default: "" })
  note!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
