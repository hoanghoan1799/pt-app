import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from "typeorm";

import {
  adminKeyId,
  aliasTargetCheck,
  GeneratedId,
  socialKeyCheck,
  userKeyId,
} from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { User } from "./user.entity.js";

@Entity("contact_aliases")
@Check("contact_aliases_owner_key_format", socialKeyCheck("owner_key"))
@Check("contact_aliases_target_key_format", aliasTargetCheck("target_key"))
@Index("contact_aliases_target_key_idx", ["targetKey"])
@ForeignKey(() => User, ["ownerUserId"], ["id"], {
  name: "fk_contact_aliases_owner_user_id",
  onDelete: "CASCADE",
})
@Index("contact_aliases_owner_user_id_idx", ["ownerUserId"], {
  where: `"owner_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["ownerAdminId"], ["id"], {
  name: "fk_contact_aliases_owner_admin_id",
  onDelete: "CASCADE",
})
@Index("contact_aliases_owner_admin_id_idx", ["ownerAdminId"], {
  where: `"owner_admin_id" IS NOT NULL`,
})
@ForeignKey(() => User, ["targetUserId"], ["id"], {
  name: "fk_contact_aliases_target_user_id",
  onDelete: "CASCADE",
})
@Index("contact_aliases_target_user_id_idx", ["targetUserId"], {
  where: `"target_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["targetAdminId"], ["id"], {
  name: "fk_contact_aliases_target_admin_id",
  onDelete: "CASCADE",
})
@Index("contact_aliases_target_admin_id_idx", ["targetAdminId"], {
  where: `"target_admin_id" IS NOT NULL`,
})
// No index on owner_key alone: the primary key (owner_key, target_key) serves it.
export class ContactAlias {
  @PrimaryColumn({ type: "text" })
  ownerKey!: string;

  @PrimaryColumn({ type: "text" })
  targetKey!: string;

  @Column({ type: "text" })
  alias!: string;

  @Column({ type: "timestamptz" })
  updatedAt!: Date;

  @GeneratedId(userKeyId("owner_key"))
  ownerUserId!: number | null;

  @GeneratedId(adminKeyId("owner_key"))
  ownerAdminId!: number | null;

  @GeneratedId(userKeyId("target_key"))
  targetUserId!: number | null;

  @GeneratedId(adminKeyId("target_key"))
  targetAdminId!: number | null;
}
