import { MigrationInterface, QueryRunner } from "typeorm";

// Reports of chat messages. Additive: a nullable `reason_code` column (the
// fixed reason list; null on a report filed before it existed) and wider
// target_kind / resolution checks ('message' and 'group_message' targets, and
// the 'hidden' resolution). The previous API version keeps working: it only
// writes values the old checks allowed. Chat messages already have
// `hidden_by_admin_id`, which is what "hidden" sets, so nothing changes there.
//
// social_reports_status_resolution (resolved <=> resolution is set) does not
// list resolutions, so it stays as it is.
//
// The two old checks were created by the baseline with generated names.
const OLD_TARGET_KIND_CHECK = "CHK_c032cbed5f50868af1e9050f9c";
const OLD_RESOLUTION_CHECK = "CHK_0f0332f048537e2909f0477d32";

export class ReportMessages1795500000000 implements MigrationInterface {
  name = "ReportMessages1795500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD "reason_code" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP CONSTRAINT "${OLD_TARGET_KIND_CHECK}"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP CONSTRAINT "${OLD_RESOLUTION_CHECK}"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_target_kind" CHECK ("target_kind" IN ('post', 'comment', 'user', 'message', 'group_message'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_resolution" CHECK ("resolution" IN ('kept', 'deleted', 'hidden'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_reason_code" CHECK ("reason_code" IN ('spam', 'harassment', 'inappropriate', 'scam', 'other'))`,
    );
    // Only a chat message can be hidden.
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_hidden_message_only" CHECK ("resolution" IS DISTINCT FROM 'hidden' OR "target_kind" IN ('message', 'group_message'))`,
    );
    // A report of a message always says why.
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD CONSTRAINT "social_reports_message_has_reason_code" CHECK ("target_kind" NOT IN ('message', 'group_message') OR "reason_code" IS NOT NULL)`,
    );
  }

  // Reports of messages cannot exist under the old checks, so they are
  // deleted; every other report is kept.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "social_reports" WHERE "target_kind" IN ('message', 'group_message')`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP CONSTRAINT "social_reports_message_has_reason_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP CONSTRAINT "social_reports_hidden_message_only"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP CONSTRAINT "social_reports_reason_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP CONSTRAINT "social_reports_resolution"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP CONSTRAINT "social_reports_target_kind"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD CONSTRAINT "${OLD_RESOLUTION_CHECK}" CHECK ("resolution" IN ('kept', 'deleted'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" ADD CONSTRAINT "${OLD_TARGET_KIND_CHECK}" CHECK ("target_kind" IN ('post', 'comment', 'user'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_reports" DROP COLUMN "reason_code"`,
    );
  }
}
