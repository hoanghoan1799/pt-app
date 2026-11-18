import { MigrationInterface, QueryRunner } from "typeorm";

// Accent color (company/main #206, #207): a personal app color on users and
// admins, a super admin color per scope (theme_settings) and per-role locks on
// the personal pick (theme_locks). Colors are normalized lower-case "#rrggbb"
// (CHECK; NULL = none). Additive: nullable columns and new tables.
const ACCENT = `'^#[0-9a-f]{6}$'`;

export class AccentTheme1795800000000 implements MigrationInterface {
  name = "AccentTheme1795800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ["admins", "users"]) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "accent_color" text`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_accent_color_format" CHECK ("accent_color" ~ ${ACCENT})`,
      );
    }

    await queryRunner.query(
      `CREATE TABLE "theme_settings" (
        "scope" text NOT NULL,
        "accent" text NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_by_admin_id" integer,
        CONSTRAINT "theme_settings_accent_format" CHECK ("accent" ~ ${ACCENT}),
        CONSTRAINT "CHK_ed4edf3bf7d766189b1acd6887" CHECK ("scope" IN ('all', 'trainee', 'pt')),
        CONSTRAINT "PK_041cab041d0c2c688fd3c237886" PRIMARY KEY ("scope")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "theme_settings_updated_by_admin_id_idx" ON "theme_settings" ("updated_by_admin_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "theme_settings" ADD CONSTRAINT "FK_12fd9804ee65aa04fee569f0f97" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "theme_locks" (
        "scope" text NOT NULL,
        "locked" boolean NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_by_admin_id" integer,
        CONSTRAINT "CHK_f7b4b5493eebe0f46937044e84" CHECK ("scope" IN ('trainee', 'pt')),
        CONSTRAINT "PK_7e9fcf4dca8f95815c256243036" PRIMARY KEY ("scope")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "theme_locks_updated_by_admin_id_idx" ON "theme_locks" ("updated_by_admin_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "theme_locks" ADD CONSTRAINT "FK_d93196537d0e1c9781734ff91b5" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "theme_locks"`);
    await queryRunner.query(`DROP TABLE "theme_settings"`);

    for (const table of ["users", "admins"]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${table}_accent_color_format"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN "accent_color"`,
      );
    }
  }
}
