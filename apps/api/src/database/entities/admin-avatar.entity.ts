import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { Admin } from "./admin.entity.js";

// The profile photo of one admin, kept out of the hot `admins` table. The
// version used in the URL stays in `admins.avatar_updated_at`; `updated_at`
// here is the same instant, written together with the bytes.
@Entity("admin_avatars")
@Check(`"mime" IN ('image/webp', 'image/jpeg', 'image/png')`)
export class AdminAvatar {
  @PrimaryColumn({ type: "integer" })
  adminId!: number;

  @OneToOne(() => Admin, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admin_id" })
  admin!: Relation<Admin>;

  @Column({ type: "text" })
  mime!: "image/webp" | "image/jpeg" | "image/png";

  @Column({ type: "bytea" })
  data!: Buffer;

  @Column({ type: "integer" })
  size!: number;

  @Column({ type: "timestamptz" })
  updatedAt!: Date;
}
