import {
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
