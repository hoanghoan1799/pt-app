import {
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
@Index("meal_mark_items_meal", ["mealId"])
@Index("meal_mark_items_mark_id_idx", ["markId"])
@Index("meal_mark_items_food_id_idx", ["foodId"])
export class MealMarkItem {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  markId!: number;

  @ManyToOne(() => MealMark, { onDelete: "CASCADE" })
  @JoinColumn({ name: "mark_id" })
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
