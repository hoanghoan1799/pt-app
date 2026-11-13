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

  @Column({ type: "timestamptz", nullable: true })
  avatarUpdatedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  passcodeHash!: string | null;

  @Column({ type: "integer", default: 0 })
  passcodeFailedCount!: number;

  @Column({ type: "boolean", default: false })
  presenceHidden!: boolean;

  // Admins created before roles existed had NULL, which the app read as super
  // admin; the migration turned those into 'super_admin'. A new row without a
  // role gets the least privilege.
  @Column({ type: "text", default: "pt" })
  role!: "super_admin" | "pt";

  @Column({ type: "timestamptz", nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  bio!: string | null;

  @Column({ type: "text", nullable: true })
  locale!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
