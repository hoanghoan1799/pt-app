import { Check, Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("admins")
@Check(`"role" IN ('super_admin', 'pt')`)
export class Admin {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  username!: string;

  @Column({ type: "text", unique: true })
  usernameKey!: string;

  @Column({ type: "text" })
  passwordHash!: string;

  @Column({ type: "timestamptz", nullable: true })
  lastSeenAt!: Date | null;

  @Column({ type: "text", nullable: true })
  chatColor!: string | null;

  @Column({ type: "text", nullable: true })
  avatar!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  avatarUpdatedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  passcodeHash!: string | null;

  @Column({ type: "integer", nullable: true, default: 0 })
  passcodeFailedCount!: number | null;

  @Column({ type: "boolean", nullable: true, default: false })
  presenceHidden!: boolean | null;

  @Column({ type: "text", nullable: true })
  role!: "super_admin" | "pt" | null;

  @Column({ type: "timestamptz", nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  bio!: string | null;

  @Column({ type: "text", nullable: true })
  locale!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
