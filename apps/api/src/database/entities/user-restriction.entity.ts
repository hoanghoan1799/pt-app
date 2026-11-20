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
import { User } from "./user.entity.js";

// A super admin's restriction on a trainee (company/main "admin block user"):
// "restricted" blocks chat and social writes, "suspended" also blocks login and
// hides the trainee from other trainees. Active while lifted_at is NULL and
// (until is NULL or in the future), computed at read time. Blocking again lifts
// the previous row first, so older rows stay as history.
//
// At most one row per trainee has lifted_at NULL (user_restrictions_one_active;
// an index cannot use now(), so a row past its `until` but never lifted still
// holds the slot). A new block therefore, in one transaction: locks the
// trainee's users row (SELECT ... FOR UPDATE, so two concurrent blocks queue
// instead of hitting the index), lifts every row with lifted_at NULL, then
// inserts. lifted_at = GREATEST(created_at, LEAST(now(), COALESCE(until,
// now()))): its `until` when that has passed, else now(), never before
// created_at (a queued transaction's now() is its start, which can be earlier
// than the row it waited for).
//
// SQLite had no foreign keys here. PostgreSQL deletes the rows with the trainee
// (the old member delete did it by hand) and clears the admin ids when an admin
// account goes, so created_by_admin_id is nullable here although SQLite had it
// NOT NULL (it never stored NULL).
@Entity("user_restrictions")
@Check(`"level" IN ('restricted', 'suspended')`)
@Check(
  "user_restrictions_lifted_by_needs_lifted_at",
  `"lifted_by_admin_id" IS NULL OR "lifted_at" IS NOT NULL`,
)
@Check(
  "user_restrictions_lifted_after_created",
  `"lifted_at" IS NULL OR "lifted_at" >= "created_at"`,
)
@Index("user_restrictions_one_active", ["userId"], {
  unique: true,
  where: `"lifted_at" IS NULL`,
})
@Index("user_restrictions_user_created", ["userId", "createdAt"])
@Index("user_restrictions_created_by_admin_id_idx", ["createdByAdminId"])
@Index("user_restrictions_lifted_by_admin_id_idx", ["liftedByAdminId"])
export class UserRestriction {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "text" })
  level!: "restricted" | "suspended";

  // NULL = permanent.
  @Column({ type: "timestamptz", nullable: true })
  until!: Date | null;

  @Column({ type: "text", default: "" })
  reason!: string;

  // NULL only once the admin account was deleted.
  @Column({ type: "integer", nullable: true })
  createdByAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "created_by_admin_id" })
  createdByAdmin!: Relation<Admin> | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  liftedAt!: Date | null;

  @Column({ type: "integer", nullable: true })
  liftedByAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "lifted_by_admin_id" })
  liftedByAdmin!: Relation<Admin> | null;
}
