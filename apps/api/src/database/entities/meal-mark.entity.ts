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

import { MealPlanMeal } from "./meal-plan-meal.entity.js";
import { User } from "./user.entity.js";

@Entity("meal_marks")
// The target of meal_mark_items' composite foreign key: an item names the same
// meal as its mark.
@Unique("meal_marks_id_meal_key", ["id", "mealId"])
@Index("meal_marks_user_id_idx", ["userId"])
export class MealMark {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer", unique: true })
  mealId!: number;

  // With user_id: the row's owner must be the owner of the meal's day.
  @ManyToOne(() => MealPlanMeal, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "meal_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "meal_marks_meal_owner_fkey",
    },
    {
      name: "user_id",
      referencedColumnName: "userId",
      foreignKeyConstraintName: "meal_marks_meal_owner_fkey",
    },
  ])
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
