import { MEAL_PLAN_LIMITS } from "@pt/contracts";
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

import { Food } from "./food.entity.js";
import { MealPlanMeal } from "./meal-plan-meal.entity.js";
import { User } from "./user.entity.js";

@Entity("meal_logs")
@Check(
  "meal_logs_grams_range",
  `"grams" >= 0 AND "grams" <= ${MEAL_PLAN_LIMITS.MAX_GRAMS}`,
)
// A library food logged at 3000 g may exceed what a typed number may, so the
// numbers only have a lower bound.
@Check(
  "meal_logs_numbers_range",
  `("kcal" IS NULL OR "kcal" >= 0) AND ("protein" IS NULL OR "protein" >= 0) AND ("carbs" IS NULL OR "carbs" >= 0) AND ("fat" IS NULL OR "fat" >= 0)`,
)
// A library log has a food, a free one has a name.
@Check(
  "meal_logs_food_or_name",
  `"food_id" IS NOT NULL OR "custom_name" IS NOT NULL`,
)
@Index("meal_logs_meal", ["mealId"])
@Index("meal_logs_user", ["userId"])
@Index("meal_logs_food_id_idx", ["foodId"])
export class MealLog {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "integer" })
  mealId!: number;

  // With user_id: the row's owner must be the owner of the meal's day.
  @ManyToOne(() => MealPlanMeal, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "meal_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "meal_logs_meal_owner_fkey",
    },
    {
      name: "user_id",
      referencedColumnName: "userId",
      foreignKeyConstraintName: "meal_logs_meal_owner_fkey",
    },
  ])
  meal!: Relation<MealPlanMeal>;

  @Column({ type: "integer", nullable: true })
  foodId!: number | null;

  @ManyToOne(() => Food, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "food_id" })
  food!: Relation<Food> | null;

  @Column({ type: "text", nullable: true })
  customName!: string | null;

  @Column({ type: "double precision" })
  grams!: number;

  @Column({ type: "double precision", nullable: true })
  kcal!: number | null;

  @Column({ type: "double precision", nullable: true })
  protein!: number | null;

  @Column({ type: "double precision", nullable: true })
  carbs!: number | null;

  @Column({ type: "double precision", nullable: true })
  fat!: number | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
