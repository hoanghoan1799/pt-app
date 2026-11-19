import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { Admin } from "./admin.entity.js";

// Super admin switches that stop a role from picking a personal app color
// (company/main accent-color spec). One row per role; no row = unlocked. A lock
// hides the picker and ignores the stored personal colors (they are kept).
@Entity("theme_locks")
@Check(`"scope" IN ('trainee', 'pt')`)
@Index("theme_locks_updated_by_admin_id_idx", ["updatedByAdminId"])
export class ThemeLock {
  @PrimaryColumn({ type: "text" })
  scope!: "trainee" | "pt";

  @Column({ type: "boolean" })
  locked!: boolean;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  @Column({ type: "integer", nullable: true })
  updatedByAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by_admin_id" })
  updatedByAdmin!: Relation<Admin> | null;
}
