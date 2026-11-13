import { SET_LIMITS } from "@pt/contracts";
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

import { Exercise } from "./exercise.entity.js";
import { User } from "./user.entity.js";

@Entity("exercise_sets")
@Check(
  "exercise_sets_reps_range",
  `"reps" BETWEEN ${SET_LIMITS.MIN_REPS} AND ${SET_LIMITS.MAX_REPS}`,
)
@Check(
  "exercise_sets_weight_range",
  `"weight_kg" IS NULL OR "weight_kg" BETWEEN ${SET_LIMITS.MIN_WEIGHT_KG} AND ${SET_LIMITS.MAX_WEIGHT_KG}`,
)
@Index("exercise_sets_exercise_position", ["exerciseId", "position"], {
  unique: true,
})
@Index("exercise_sets_user", ["userId"])
export class ExerciseSet {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  exerciseId!: number;

  // With user_id: the row's owner must be the owner of the exercise.
  @ManyToOne(() => Exercise, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "exercise_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "exercise_sets_exercise_owner_fkey",
    },
    {
      name: "user_id",
      referencedColumnName: "userId",
      foreignKeyConstraintName: "exercise_sets_exercise_owner_fkey",
    },
  ])
  exercise!: Relation<Exercise>;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "integer" })
  position!: number;

  @Column({ type: "double precision", nullable: true })
  weightKg!: number | null;

  @Column({ type: "integer" })
  reps!: number;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
