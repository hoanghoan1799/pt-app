import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("contact_aliases")
@Index("contact_aliases_owner_key", ["ownerKey"])
export class ContactAlias {
  @PrimaryColumn({ type: "text" })
  ownerKey!: string;

  @PrimaryColumn({ type: "text" })
  targetKey!: string;

  @Column({ type: "text" })
  alias!: string;

  @Column({ type: "timestamptz" })
  updatedAt!: Date;
}
