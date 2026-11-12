import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { Admin } from "./admin.entity.js";
import { User } from "./user.entity.js";

@Entity("admin_hidden_users")
@Index("admin_hidden_users_user_id_idx", ["userId"])
export class AdminHiddenUser {
  @PrimaryColumn({ type: "integer" })
  adminId!: number;

  @ManyToOne(() => Admin, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admin_id" })
  admin!: Relation<Admin>;

  @PrimaryColumn({ type: "integer" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "timestamptz", default: () => "now()" })
  hiddenAt!: Date;
}
