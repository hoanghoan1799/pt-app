import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  adminKeyId,
  GeneratedId,
  socialKeyCheck,
  userKeyId,
} from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { User } from "./user.entity.js";

@Entity("push_subscriptions")
@Check("push_subscriptions_owner_key_format", socialKeyCheck("owner_key"))
@ForeignKey(() => User, ["ownerUserId"], ["id"], {
  name: "fk_push_subscriptions_owner_user_id",
  onDelete: "CASCADE",
})
@Index("push_subscriptions_owner_user_id_idx", ["ownerUserId"], {
  where: `"owner_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["ownerAdminId"], ["id"], {
  name: "fk_push_subscriptions_owner_admin_id",
  onDelete: "CASCADE",
})
@Index("push_subscriptions_owner_admin_id_idx", ["ownerAdminId"], {
  where: `"owner_admin_id" IS NOT NULL`,
})
@Index("push_subscriptions_owner_key", ["ownerKey"])
@Check(`"kind" IN ('web', 'expo', 'fcm')`)
// A web push subscription is useless without its keys.
@Check(
  "push_subscriptions_web_keys",
  `"kind" <> 'web' OR ("p256dh" IS NOT NULL AND "auth" IS NOT NULL)`,
)
export class PushSubscription {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  ownerKey!: string;

  @Column({ type: "text", unique: true })
  endpoint!: string;

  // web rows keep the Web Push keys; expo/fcm rows store the device token in
  // `endpoint` and leave the keys null.
  @Column({ type: "text", nullable: true })
  p256dh!: string | null;

  @Column({ type: "text", nullable: true })
  auth!: string | null;

  @Column({ type: "text", default: "web" })
  kind!: "web" | "expo" | "fcm";

  @Column({ type: "text", default: "" })
  userAgent!: string;

  @Column({ type: "timestamptz", nullable: true })
  lastSuccessAt!: Date | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @GeneratedId(userKeyId("owner_key"))
  ownerUserId!: number | null;

  @GeneratedId(adminKeyId("owner_key"))
  ownerAdminId!: number | null;
}
