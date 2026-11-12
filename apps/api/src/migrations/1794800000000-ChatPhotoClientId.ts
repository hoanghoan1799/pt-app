import { MigrationInterface, QueryRunner } from "typeorm";

// Additive: the Idempotency-Key of a chat photo upload. Old rows keep NULL
// (PostgreSQL unique indexes allow many NULLs).
export class ChatPhotoClientId1794800000000 implements MigrationInterface {
  name = "ChatPhotoClientId1794800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_photos" ADD "client_id" text`);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "chat_photos_uploader_client" ON "chat_photos" ("conversation_id", "uploader_key", "client_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."chat_photos_uploader_client"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_photos" DROP COLUMN "client_id"`,
    );
  }
}
