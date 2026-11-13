import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("contact_aliases")
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
}
