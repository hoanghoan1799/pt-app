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

import {
  adminKeyId,
  GeneratedId,
  kindId,
  socialKeyCheck,
  userKeyId,
} from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { User } from "./user.entity.js";

@Entity("social_reports")
@Check("social_reports_reporter_key_format", socialKeyCheck("reporter_key"))
@Check("social_reports_target_id_positive", `"target_id" > 0`)
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
// One open report per reporter and target; ReportsService.create relies on it.
@Index(
  "social_reports_open_unique",
  ["reporterKey", "targetKind", "targetId"],
  { unique: true, where: `"status" = 'open'` },
)
// resolved <=> resolution and resolved_at are set; open <=> all three are null.
// resolved_by may be null on a resolved report (the admin was removed).
@Check(
  "social_reports_status_resolution",
  `("status" = 'open' AND "resolution" IS NULL AND "resolved_at" IS NULL AND "resolved_by" IS NULL) OR ("status" = 'resolved' AND "resolution" IS NOT NULL AND "resolved_at" IS NOT NULL)`,
)
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
