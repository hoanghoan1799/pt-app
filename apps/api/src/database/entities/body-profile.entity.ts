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
