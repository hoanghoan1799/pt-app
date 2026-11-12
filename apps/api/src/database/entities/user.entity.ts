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

@Entity("users")
@Index("users_pt_admin", ["ptAdminId"])
@Check(`"post_privacy_default" IN ('everyone', 'friends', 'only_me')`)
@Index("users_chat_enabled_by_admin_id_idx", ["chatEnabledByAdminId"])
export class User {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text", nullable: true })
  locale!: string | null;

  @Column({ type: "text", unique: true })
  nameKey!: string;

  @Column({ type: "integer", nullable: true })
  preferredMealCount!: number | null;

  @Column({ type: "text", nullable: true })
  foodNote!: string | null;

  @Column({ type: "text", nullable: true })
  email!: string | null;

  @Column({ type: "text", nullable: true, unique: true })
  emailKey!: string | null;

  @Column({ type: "text", nullable: true })
  passwordHash!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  passwordChangedAt!: Date | null;

  @Column({ type: "boolean", nullable: true })
  chatEnabled!: boolean | null;

  @Column({ type: "timestamptz", nullable: true })
  chatEnabledChangedAt!: Date | null;

  @Column({ type: "integer", nullable: true })
  chatEnabledByAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "chat_enabled_by_admin_id" })
  chatEnabledByAdmin!: Relation<Admin> | null;

  @Column({ type: "timestamptz", nullable: true })
  lastSeenAt!: Date | null;

  @Column({ type: "text", nullable: true })
  chatColor!: string | null;

  @Column({ type: "text", nullable: true })
  avatar!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  avatarUpdatedAt!: Date | null;

  @Column({ type: "integer", nullable: true })
  ptAdminId!: number | null;

  @ManyToOne(() => Admin, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "pt_admin_id" })
  ptAdmin!: Relation<Admin> | null;

  @Column({ type: "text", nullable: true })
  bio!: string | null;

  @Column({ type: "integer", nullable: true })
  termsVersion!: number | null;

  @Column({ type: "timestamptz", nullable: true })
  termsAcceptedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  postPrivacyDefault!: "everyone" | "friends" | "only_me" | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
