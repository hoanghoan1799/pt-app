import {
  BODY_LIMITS,
  KCAL_ADJUSTMENT_LIMITS,
  PROTEIN_PER_KG_LIMITS,
} from "@pt/contracts";
import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { User } from "./user.entity.js";

@Entity("body_profiles")
// The form takes an age (BODY_LIMITS.AGE) and stores the year; these bounds
// only have to hold every year that age can give.
@Check("body_profiles_birth_year_range", `"birth_year" BETWEEN 1900 AND 2100`)
@Check(
  "body_profiles_height_range",
  `"height_cm" BETWEEN ${BODY_LIMITS.HEIGHT_CM.min} AND ${BODY_LIMITS.HEIGHT_CM.max}`,
)
@Check(
  "body_profiles_weight_range",
  `"weight_kg" BETWEEN ${BODY_LIMITS.WEIGHT_KG.min} AND ${BODY_LIMITS.WEIGHT_KG.max}`,
)
@Check(
  "body_profiles_kcal_adjustment_range",
  `"kcal_adjustment" IS NULL OR "kcal_adjustment" BETWEEN ${KCAL_ADJUSTMENT_LIMITS.min} AND ${KCAL_ADJUSTMENT_LIMITS.max}`,
)
@Check(
  "body_profiles_protein_per_kg_range",
  `"protein_per_kg" IS NULL OR "protein_per_kg" BETWEEN ${PROTEIN_PER_KG_LIMITS.min} AND ${PROTEIN_PER_KG_LIMITS.max}`,
)
@Check(`"sex" IN ('male', 'female')`)
@Check(
  `"activity_level" IN ('sedentary', 'light', 'moderate', 'active', 'very_active')`,
)
@Check(`"goal" IN ('cut', 'maintain', 'bulk')`)
export class BodyProfile {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer", unique: true })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "text" })
  sex!: "male" | "female";

  @Column({ type: "integer" })
  birthYear!: number;

  @Column({ type: "double precision" })
  heightCm!: number;

  // The weight the profile (and its TDEE target) was last computed with. The
  // services keep it equal to the latest weight_logs row (a profile save logs
  // today's weight; a newer log updates it), but it is not derived: profiles
  // from before weigh-ins were logged have no log to read it from, and a log
  // dated before the newest one leaves it alone.
  @Column({ type: "double precision" })
  weightKg!: number;

  @Column({ type: "text" })
  activityLevel!: "sedentary" | "light" | "moderate" | "active" | "very_active";

  @Column({ type: "text" })
  goal!: "cut" | "maintain" | "bulk";

  @Column({ type: "integer", nullable: true })
  kcalAdjustment!: number | null;

  @Column({ type: "double precision", nullable: true })
  proteinPerKg!: number | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
