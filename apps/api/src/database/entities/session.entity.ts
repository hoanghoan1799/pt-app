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

// Opaque login sessions. The secret token lives only in the client; the table
// keeps its SHA-256 hash (see the blueprint, "New table: sessions").
@Entity("sessions")
@Index("sessions_user_id_idx", ["userId"])
@Index("sessions_admin_id_idx", ["adminId"])
@Index("sessions_expires_at_idx", ["expiresAt"])
@Check(`"subject_kind" IN ('user', 'admin')`)
@Check(`"client_kind" IN ('web', 'ios', 'android')`)
@Check(
  `("subject_kind" = 'user' AND "user_id" IS NOT NULL AND "admin_id" IS NULL) OR ("subject_kind" = 'admin' AND "admin_id" IS NOT NULL AND "user_id" IS NULL)`,
)
export class Session {
  // Public handle; never the secret.
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // SHA-256 of the 32-byte random token.
  @Column({ type: "bytea", unique: true })
  tokenHash!: Buffer;

  @Column({ type: "text" })
  subjectKind!: "user" | "admin";

  @Column({ type: "integer", nullable: true })
  userId!: number | null;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User> | null;

  @Column({ type: "integer", nullable: true })
  adminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "admin_id" })
  admin!: Relation<Admin> | null;

  // Admin passcode windows (replace the JWT roles unlock and reveal).
  @Column({ type: "timestamptz", nullable: true })
  unlockedUntil!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  revealedUntil!: Date | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "text" })
  clientKind!: "web" | "ios" | "android";

  // Device name shown in the signed-in devices list.
  @Column({ type: "text", nullable: true })
  clientName!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  lastSeenAt!: Date;

  @Column({ type: "text", nullable: true })
  userAgent!: string | null;

  @Column({ type: "text", nullable: true })
  ip!: string | null;
}
