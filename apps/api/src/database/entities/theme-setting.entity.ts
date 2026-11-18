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

import { accentColorCheck } from "./accent-color.js";
import { Admin } from "./admin.entity.js";

// App primary color per audience (company/main accent-color spec). One row per
// scope with an override; no row = the next scope in the precedence (role >
// all > the default color). Only a super admin writes it.
@Entity("theme_settings")
@Check(`"scope" IN ('all', 'trainee', 'pt')`)
@Check("theme_settings_accent_format", accentColorCheck("accent"))
@Index("theme_settings_updated_by_admin_id_idx", ["updatedByAdminId"])
export class ThemeSetting {
  @PrimaryColumn({ type: "text" })
  scope!: "all" | "trainee" | "pt";

  // Normalized "#rrggbb".
  @Column({ type: "text" })
  accent!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  @Column({ type: "integer", nullable: true })
  updatedByAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "updated_by_admin_id" })
  updatedByAdmin!: Relation<Admin> | null;
}
