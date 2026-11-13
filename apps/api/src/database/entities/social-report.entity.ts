import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";

import { adminKeyId, GeneratedId, kindId,userKeyId } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { User } from "./user.entity.js";

@Entity("social_reports")
@Index("social_reports_reporter_key_idx", ["reporterKey"])
@Index("social_reports_target_idx", ["targetKind", "targetId"])
@ForeignKey(() => User, ["reporterUserId"], ["id"], {
  name: "fk_social_reports_reporter_user_id",
  onDelete: "CASCADE",
})
@Index("social_reports_reporter_user_id_idx", ["reporterUserId"], {
  where: `"reporter_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["reporterAdminId"], ["id"], {
  name: "fk_social_reports_reporter_admin_id",
  onDelete: "CASCADE",
})
@Index("social_reports_reporter_admin_id_idx", ["reporterAdminId"], {
  where: `"reporter_admin_id" IS NOT NULL`,
})
@ForeignKey(() => User, ["targetUserId"], ["id"], {
  name: "fk_social_reports_target_user_id",
  onDelete: "CASCADE",
})
@Index("social_reports_target_user_id_idx", ["targetUserId"], {
  where: `"target_user_id" IS NOT NULL`,
})
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

  @GeneratedId(userKeyId("reporter_key"))
  reporterUserId!: number | null;

  @GeneratedId(adminKeyId("reporter_key"))
  reporterAdminId!: number | null;

  @GeneratedId(kindId("target_kind", "target_id", "user"))
  targetUserId!: number | null;
}
