import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("chat_custom_stickers")
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
}
