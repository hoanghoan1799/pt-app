import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("foods")
@Index("foods_active_name_key", ["nameKey"], {
  unique: true,
  where: '"archived_at" IS NULL',
})
@Check(
  `"group" IN ('meat', 'seafood', 'egg_dairy', 'starch', 'vegetable', 'fruit', 'legume_nut', 'fat_oil', 'dish', 'other')`,
)
@Check(`"state" IN ('raw', 'cooked')`)
// PG only: created by the baseline migration, never touched by the schema diff.
@Index("foods_name_key_trgm", { synchronize: false })
export class Food {
  @PrimaryGeneratedColumn("identity", { generatedIdentity: "ALWAYS" })
  id!: number;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text" })
  nameKey!: string;

  @Column({ type: "text", nullable: true })
  nameEn!: string | null;

  @Column({ type: "text", nullable: true })
  nameZh!: string | null;

  @Column({ type: "text" })
  group!:
    | "meat"
    | "seafood"
    | "egg_dairy"
    | "starch"
    | "vegetable"
    | "fruit"
    | "legume_nut"
    | "fat_oil"
    | "dish"
    | "other";

  @Column({ type: "text", nullable: true })
  state!: "raw" | "cooked" | null;

  @Column({ type: "double precision" })
  kcal!: number;

  @Column({ type: "double precision" })
  protein!: number;

  @Column({ type: "double precision" })
  carbs!: number;

  @Column({ type: "double precision" })
  fat!: number;

  @Column({ type: "double precision", nullable: true })
  fiber!: number | null;

  @Column({ type: "text", nullable: true })
  servingLabel!: string | null;

  @Column({ type: "double precision", nullable: true })
  servingGrams!: number | null;

  @Column({ type: "text", default: "" })
  source!: string;

  @Column({ type: "timestamptz", nullable: true })
  archivedAt!: Date | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
