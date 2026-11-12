import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { MealPlanDay } from "./meal-plan-day.entity.js";

@Entity("meal_plan_meals")
@Index("meal_plan_meals_day", ["dayId"])
export class MealPlanMeal {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  dayId!: number;

  @ManyToOne(() => MealPlanDay, { onDelete: "CASCADE" })
  @JoinColumn({ name: "day_id" })
  day!: Relation<MealPlanDay>;

  @Column({ type: "integer" })
  position!: number;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "double precision", nullable: true })
  sharePercent!: number | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
