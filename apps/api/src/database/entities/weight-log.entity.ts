import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { User } from "./user.entity.js";

@Entity("weight_logs")
@Index("weight_logs_user_date", ["userId", "date"], { unique: true })
export class WeightLog {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "date" })
  date!: string;

  @Column({ type: "double precision" })
  weightKg!: number;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
