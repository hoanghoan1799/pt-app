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
import { MealMark } from "./meal-mark.entity.js";
import { MealPlanMeal } from "./meal-plan-meal.entity.js";

@Entity("meal_mark_items")
@Check(
  "meal_mark_items_numbers_range",
  `"grams" >= 0 AND "protein" >= 0 AND "carbs" >= 0 AND "fat" >= 0 AND "kcal" >= 0`,
)
@Index("meal_mark_items_meal", ["mealId"])
@Index("meal_mark_items_mark_id_idx", ["markId"])
@Index("meal_mark_items_food_id_idx", ["foodId"])
export class MealMarkItem {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  markId!: number;

  // With meal_id: the item names the same meal as its mark (meal_id is kept
  // for the queries that start from a meal).
  @ManyToOne(() => MealMark, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "mark_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "meal_mark_items_mark_meal_fkey",
    },
    {
      name: "meal_id",
      referencedColumnName: "mealId",
      foreignKeyConstraintName: "meal_mark_items_mark_meal_fkey",
    },
  ])
  mark!: Relation<MealMark>;

  @Column({ type: "integer" })
  mealId!: number;

  @ManyToOne(() => MealPlanMeal, { onDelete: "CASCADE" })
  @JoinColumn({ name: "meal_id" })
  meal!: Relation<MealPlanMeal>;

  @Column({ type: "integer", nullable: true })
  foodId!: number | null;

  @ManyToOne(() => Food, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "food_id" })
  food!: Relation<Food> | null;

  @Column({ type: "double precision" })
  grams!: number;

  @Column({ type: "double precision" })
  protein!: number;

  @Column({ type: "double precision" })
  carbs!: number;

  @Column({ type: "double precision" })
  fat!: number;

  @Column({ type: "double precision" })
  kcal!: number;
}
