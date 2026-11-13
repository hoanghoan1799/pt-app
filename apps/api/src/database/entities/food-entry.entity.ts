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

@Entity("food_entries")
@Check(`"meal" IN ('breakfast', 'lunch', 'dinner', 'snack')`)
@Index("food_entries_user_id_idx", ["userId"])
export class FoodEntry {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "date" })
  date!: string;

  @Column({ type: "text" })
  meal!: "breakfast" | "lunch" | "dinner" | "snack";

  @Column({ type: "text", default: "" })
  description!: string;

  @Column({ type: "integer", nullable: true })
  carbs!: number | null;

  @Column({ type: "integer", nullable: true })
  protein!: number | null;

  @Column({ type: "integer", nullable: true })
  fat!: number | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
