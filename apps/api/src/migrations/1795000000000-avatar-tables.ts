import { MigrationInterface, QueryRunner } from "typeorm";

const CHECK = `"mime" IN ('image/webp', 'image/jpeg', 'image/png')`;

// Copies the data-URL avatars of `owner` ("users" -> "user_avatars") into the
// new table. A value that is not a base64 image data URL could never be served
// (the avatar route 404s on it), so it is not copied; each one is reported as a
// WARNING with its id and never its content.
const copyAvatars = (owner: "users" | "admins", target: string, fk: string) => `
  DO $$
  DECLARE
    r record;
    skipped integer := 0;
  BEGIN
    FOR r IN
      SELECT id, avatar, avatar_updated_at FROM ${owner} WHERE avatar IS NOT NULL
    LOOP
      BEGIN
        IF r.avatar !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' THEN
          RAISE EXCEPTION 'not a base64 image data URL';
        END IF;
        INSERT INTO ${target} (${fk}, mime, data, size, updated_at)
        SELECT r.id,
               substring(r.avatar FROM '^data:([^;]+);'),
               bytes,
               octet_length(bytes),
               COALESCE(r.avatar_updated_at, now())
          FROM (SELECT decode(substring(r.avatar FROM ',(.*)$'), 'base64') AS bytes) AS decoded
         WHERE octet_length(bytes) > 0;
      EXCEPTION WHEN OTHERS THEN
        skipped := skipped + 1;
        RAISE WARNING '${owner}.avatar of id % was not copied (%)', r.id, SQLERRM;
      END;
    END LOOP;
    IF skipped > 0 THEN
      RAISE WARNING '% ${owner} avatar value(s) were not copied', skipped;
    END IF;
  END $$`;

// Moves the profile photos out of the hot users/admins rows into their own
// tables (bytea, like every other image). The cache version stays in
// avatar_updated_at. Not additive: it drops users.avatar and admins.avatar, so
// the previous API version cannot run against the migrated schema.
export class AvatarTables1795000000000 implements MigrationInterface {
  name = "AvatarTables1795000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_avatars" ("user_id" integer NOT NULL, "mime" text NOT NULL, "data" bytea NOT NULL, "size" integer NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_0cad6c58095e20b055c5d6a153" CHECK (${CHECK}), CONSTRAINT "PK_2681c26ee00a969a6143ab8d38c" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "admin_avatars" ("admin_id" integer NOT NULL, "mime" text NOT NULL, "data" bytea NOT NULL, "size" integer NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "CHK_85541ac06772e0ef8195282bb3" CHECK (${CHECK}), CONSTRAINT "PK_f634d4983d76ca931909da109e3" PRIMARY KEY ("admin_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_avatars" ADD CONSTRAINT "FK_2681c26ee00a969a6143ab8d38c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_avatars" ADD CONSTRAINT "FK_f634d4983d76ca931909da109e3" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(copyAvatars("users", "user_avatars", "user_id"));
    await queryRunner.query(copyAvatars("admins", "admin_avatars", "admin_id"));
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar"`);
    await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "avatar"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "avatar" text`);
    await queryRunner.query(`ALTER TABLE "admins" ADD "avatar" text`);
    await queryRunner.query(`
      -- encode() wraps base64 at 76 characters; a data URL has no line breaks
      UPDATE "users" SET "avatar" = 'data:' || a.mime || ';base64,' || replace(encode(a.data, 'base64'), E'\n', '')
        FROM "user_avatars" a WHERE a.user_id = "users".id`);
    await queryRunner.query(`
      UPDATE "admins" SET "avatar" = 'data:' || a.mime || ';base64,' || replace(encode(a.data, 'base64'), E'\n', '')
        FROM "admin_avatars" a WHERE a.admin_id = "admins".id`);
    await queryRunner.query(`DROP TABLE "user_avatars"`);
    await queryRunner.query(`DROP TABLE "admin_avatars"`);
  }
}
