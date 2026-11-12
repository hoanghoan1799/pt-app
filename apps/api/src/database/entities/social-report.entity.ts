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

import { Admin } from "./admin.entity.js";

@Entity("social_reports")
@Index("social_reports_status", ["status", "createdAt"])
@Check(`"target_kind" IN ('post', 'comment', 'user')`)
@Check(`"status" IN ('open', 'resolved')`)
@Check(`"resolution" IN ('kept', 'deleted')`)
@Index("social_reports_resolved_by_idx", ["resolvedBy"])
export class SocialReport {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  reporterKey!: string;

  @Column({ type: "text" })
  targetKind!: "post" | "comment" | "user";

  @Column({ type: "integer" })
  targetId!: number;

  @Column({ type: "text", default: "" })
  reason!: string;

  @Column({ type: "text" })
  status!: "open" | "resolved";

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "integer", nullable: true })
  resolvedBy!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "resolved_by" })
  resolvedByRef!: Relation<Admin> | null;

  @Column({ type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  resolution!: "kept" | "deleted" | null;
}
