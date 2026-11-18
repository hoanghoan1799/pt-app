import { MigrationInterface, QueryRunner } from "typeorm";

// Up to 10 photos per social post, chat message and DM message.
//
// 1. A nullable integer `position` on chat_photos, dm_photos and
//    social_post_photos: the order inside the message or post (0 = cover). NULL
//    (every row from before several photos) counts as 0, so no data changes.
//    CHECK position >= 0, and one position per message or post once attached.
// 2. The photo -> owner composite FK (message_id, id) -> (id, photo_id) made the
//    owner's single photo_id the only photo that could be attached. It becomes
//    a plain FK on the owner (still ON DELETE CASCADE, still deferred). The
//    owner -> photo FK stays: photo_id (the cover, what an older API version
//    reads and writes) must be a photo attached to that very owner.
//
// Additive for the previous API version: a nullable column it never reads, and
// a constraint that only got looser.
//
// down: the extra photos (attached but not the cover) are deleted, because the
// stricter FK cannot hold them; covers and pending photos stay.

type Table = {
  photos: string;
  owners: string;
  ownerColumn: string;
  fk: string;
  position: string;
  check: string;
};

const TABLES: Table[] = [
  {
    photos: "chat_photos",
    owners: "chat_messages",
    ownerColumn: "message_id",
    fk: "fk_chat_photos_message",
    position: "chat_photos_message_position",
    check: "chat_photos_position_nonnegative",
  },
  {
    photos: "dm_photos",
    owners: "dm_messages",
    ownerColumn: "message_id",
    fk: "fk_dm_photos_message",
    position: "dm_photos_message_position",
    check: "dm_photos_position_nonnegative",
  },
  {
    photos: "social_post_photos",
    owners: "social_posts",
    ownerColumn: "post_id",
    fk: "fk_social_post_photos_post",
    position: "social_post_photos_post_position",
    check: "social_post_photos_position_nonnegative",
  },
];

export class PhotoPosition1795400000000 implements MigrationInterface {
  name = "PhotoPosition1795400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${t.photos}" ADD "position" integer`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.photos}" ADD CONSTRAINT "${t.check}" CHECK ("position" IS NULL OR "position" >= 0)`,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX "${t.position}" ON "${t.photos}" ("${t.ownerColumn}", "position") WHERE "${t.ownerColumn}" IS NOT NULL AND "position" IS NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.photos}" DROP CONSTRAINT "${t.fk}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.photos}" ADD CONSTRAINT "${t.fk}" FOREIGN KEY ("${t.ownerColumn}") REFERENCES "${t.owners}" ("id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of [...TABLES].reverse()) {
      // Only the cover can stay attached under the composite FK.
      await queryRunner.query(
        `DELETE FROM "${t.photos}" p USING "${t.owners}" o
          WHERE p."${t.ownerColumn}" = o."id" AND o."photo_id" IS DISTINCT FROM p."id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.photos}" DROP CONSTRAINT "${t.fk}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.photos}" ADD CONSTRAINT "${t.fk}" FOREIGN KEY ("${t.ownerColumn}", "id") REFERENCES "${t.owners}" ("id", "photo_id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`,
      );
      await queryRunner.query(`DROP INDEX "public"."${t.position}"`);
      await queryRunner.query(
        `ALTER TABLE "${t.photos}" DROP CONSTRAINT "${t.check}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${t.photos}" DROP COLUMN "position"`,
      );
    }
  }
}
