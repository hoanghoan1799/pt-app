import type { MigrationInterface, QueryRunner } from "typeorm";

// Additive: a nullable column and a partial unique index, so a retried
// "create post" with the same Idempotency-Key returns the first post.
export class SocialPostIdempotency1794600000000 implements MigrationInterface {
  name = "SocialPostIdempotency1794600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "social_posts" ADD "idempotency_key" text`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "social_posts_idempotency" ON "social_posts" ("author_kind", "author_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."social_posts_idempotency"`);
    await queryRunner.query(
      `ALTER TABLE "social_posts" DROP COLUMN "idempotency_key"`,
    );
  }
}
