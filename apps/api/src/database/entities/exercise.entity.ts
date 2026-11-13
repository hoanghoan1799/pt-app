import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from "typeorm";

import { WorkoutDay } from "./workout-day.entity.js";

@Entity("exercises")
// The target of the composite foreign keys of the sets and completions a
// trainee logs (their user_id must be the owner of the exercise's day).
@Unique("exercises_id_user_key", ["id", "userId"])
// Deferred, so a reorder or a swap inside one transaction may pass through a
// duplicate on the way to a valid order.
@Unique("exercises_day_position_key", ["dayId", "position"], {
  deferrable: "INITIALLY DEFERRED",
})
export class Exercise {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  dayId!: number;

  // The owner of the day, copied here so the foreign key below can prove the
  // two agree (and the children of an exercise can be tied to the same owner).
  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => WorkoutDay, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "day_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "exercises_day_owner_fkey",
    },
    {
      name: "user_id",
      referencedColumnName: "userId",
      foreignKeyConstraintName: "exercises_day_owner_fkey",
    },
  ])
  day!: Relation<WorkoutDay>;

  @Column({ type: "text" })
  title!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @Column({ type: "integer", nullable: true })
  sets!: number | null;

  @Column({ type: "text", default: "" })
  reps!: string;

  @Column({ type: "text" })
  youtubeId!: string;

  @Column({ type: "integer", default: 0 })
  position!: number;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
