import { NUTRITION_LIMITS } from "@pt/contracts";
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

import { User } from "./user.entity.js";

@Entity("nutrition_targets")
@Check(
  "nutrition_targets_grams_range",
  [`"carbs"`, `"protein"`, `"fat"`]
    .map((column) => `${column} BETWEEN 0 AND ${NUTRITION_LIMITS.MAX_GRAMS}`)
    .join(" AND "),
)
@Index("nutrition_targets_user_from", ["userId", "effectiveFrom"], {
  unique: true,
})
@Check(`"source" IN ('manual', 'tdee')`)
export class NutritionTarget {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "date" })
  effectiveFrom!: string;

  @Column({ type: "integer" })
  carbs!: number;

  @Column({ type: "integer" })
  protein!: number;

  @Column({ type: "integer" })
  fat!: number;

  @Column({ type: "text", default: "" })
  note!: string;

  @Column({ type: "text", default: "manual" })
  source!: "manual" | "tdee";

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
