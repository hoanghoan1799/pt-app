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

@Entity("meal_plan_items")
@Check(
  "meal_plan_items_grams_range",
  `"grams" > 0 AND "grams" <= ${MEAL_PLAN_LIMITS.MAX_GRAMS}`,
)
@Index("meal_plan_items_meal", ["mealId"])
@Index("meal_plan_items_food_id_idx", ["foodId"])
export class MealPlanItem {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  mealId!: number;

  @ManyToOne(() => MealPlanMeal, { onDelete: "CASCADE" })
  @JoinColumn({ name: "meal_id" })
  meal!: Relation<MealPlanMeal>;

  @Column({ type: "integer" })
  foodId!: number;

  @ManyToOne(() => Food, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "food_id" })
  food!: Relation<Food>;

  @Column({ type: "double precision" })
  grams!: number;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
