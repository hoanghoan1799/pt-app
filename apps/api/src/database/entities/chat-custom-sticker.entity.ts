import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import { GeneratedId, kindId } from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { User } from "./user.entity.js";

@Entity("chat_custom_stickers")
@Check("chat_custom_stickers_owner_id_positive", `"owner_id" > 0`)
@ForeignKey(() => User, ["ownerUserId"], ["id"], {
  name: "fk_chat_custom_stickers_owner_user_id",
  onDelete: "CASCADE",
})
@Index("chat_custom_stickers_owner_user_id_idx", ["ownerUserId"], {
  where: `"owner_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["ownerAdminId"], ["id"], {
  name: "fk_chat_custom_stickers_owner_admin_id",
  onDelete: "CASCADE",
})
@Index("chat_custom_stickers_owner_admin_id_idx", ["ownerAdminId"], {
  where: `"owner_admin_id" IS NOT NULL`,
})
@Index("chat_custom_stickers_owner", ["ownerKind", "ownerId"])
@Check(`"owner_kind" IN ('user', 'admin')`)
@Check(`"mime" IN ('image/webp', 'image/png')`)
export class ChatCustomSticker {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  ownerKind!: "user" | "admin";

  @Column({ type: "integer" })
  ownerId!: number;

  @Column({ type: "text" })
  mime!: "image/webp" | "image/png";

  @Column({ type: "bytea" })
  data!: Buffer;

  @Column({ type: "integer" })
  size!: number;

  @Column({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @GeneratedId(kindId("owner_kind", "owner_id", "user"))
  ownerUserId!: number | null;

  @GeneratedId(kindId("owner_kind", "owner_id", "admin"))
  ownerAdminId!: number | null;
}
