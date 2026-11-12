import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("push_subscriptions")
@Index("push_subscriptions_owner_key", ["ownerKey"])
@Check(`"kind" IN ('web', 'expo', 'fcm')`)
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
}
