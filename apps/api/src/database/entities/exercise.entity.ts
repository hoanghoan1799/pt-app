import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { WorkoutDay } from "./workout-day.entity.js";

@Entity("exercises")
@Index("exercises_day_id_idx", ["dayId"])
export class Exercise {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  dayId!: number;

  @ManyToOne(() => WorkoutDay, { onDelete: "CASCADE" })
  @JoinColumn({ name: "day_id" })
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
