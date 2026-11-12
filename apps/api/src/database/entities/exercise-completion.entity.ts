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

@Entity("exercise_completions")
@Index("exercise_completions_user_id_idx", ["userId"])
export class ExerciseCompletion {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer", unique: true })
  exerciseId!: number;

  @ManyToOne(() => Exercise, { onDelete: "CASCADE" })
  @JoinColumn({ name: "exercise_id" })
  exercise!: Relation<Exercise>;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "timestamptz" })
  completedAt!: Date;
}
