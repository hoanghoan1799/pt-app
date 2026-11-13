import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from "typeorm";

import { MealPlanDay } from "./meal-plan-day.entity.js";

@Entity("meal_plan_meals")
@Check(
  "meal_plan_meals_share_range",
  `"share_percent" IS NULL OR "share_percent" BETWEEN 0 AND 100`,
)
// The target of the composite foreign keys of meal_logs and meal_marks: what a
// trainee logs for a meal carries the owner of the meal's day.
@Unique("meal_plan_meals_id_user_key", ["id", "userId"])
// Deferred, so a reorder inside one transaction may pass through a duplicate.
@Unique("meal_plan_meals_day_position_key", ["dayId", "position"], {
  deferrable: "INITIALLY DEFERRED",
})
export class MealPlanMeal {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  dayId!: number;

  // The owner of the day, copied here so the foreign key below can prove the
  // two agree.
  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => MealPlanDay, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "day_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "meal_plan_meals_day_owner_fkey",
    },
    {
      name: "user_id",
      referencedColumnName: "userId",
      foreignKeyConstraintName: "meal_plan_meals_day_owner_fkey",
    },
  ])
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
