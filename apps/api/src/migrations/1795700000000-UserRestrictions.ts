import { MigrationInterface, QueryRunner } from "typeorm";

// Admin block user (company/main #199): user_restrictions, a super admin's
// "restricted" / "suspended" level on a trainee with an optional end, lifted
// rows kept as history. Additive: a new table nothing older reads.
//
// SQLite had no foreign keys here. PostgreSQL deletes the rows with the trainee
// and clears the admin ids when an admin account is deleted, so
// created_by_admin_id is nullable (SQLite: NOT NULL, never NULL in the data).
export class UserRestrictions1795700000000 implements MigrationInterface {
  name = "UserRestrictions1795700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_restrictions" (
        "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
        "user_id" integer NOT NULL,
        "level" text NOT NULL,
        "until" TIMESTAMP WITH TIME ZONE,
        "reason" text NOT NULL DEFAULT '',
        "created_by_admin_id" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "lifted_at" TIMESTAMP WITH TIME ZONE,
        "lifted_by_admin_id" integer,
        CONSTRAINT "user_restrictions_lifted_by_needs_lifted_at" CHECK ("lifted_by_admin_id" IS NULL OR "lifted_at" IS NOT NULL),
        CONSTRAINT "CHK_820801f8e33c1cd1e8c3145e4e" CHECK ("level" IN ('restricted', 'suspended')),
        CONSTRAINT "PK_39ff399710977d6e2a79f5ee9ca" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "user_restrictions_lifted_by_admin_id_idx" ON "user_restrictions" ("lifted_by_admin_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "user_restrictions_created_by_admin_id_idx" ON "user_restrictions" ("created_by_admin_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "user_restrictions_user_created" ON "user_restrictions" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_restrictions" ADD CONSTRAINT "FK_6b2539d4941dd4892e2afbbba55" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_restrictions" ADD CONSTRAINT "FK_bee529873928f3f1d84e1fa6993" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_restrictions" ADD CONSTRAINT "FK_da39654c89e9af3704a5cf785c7" FOREIGN KEY ("lifted_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_restrictions"`);
  }
}
