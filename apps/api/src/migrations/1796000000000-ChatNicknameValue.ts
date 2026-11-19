import { MigrationInterface, QueryRunner } from "typeorm";

// chat_nicknames.nickname only had a length CHECK (1 to 30 characters), so a
// value of spaces alone, or one with a tab or a control character, passed.
// This matches the CHECK to what the API's Zod schema stores
// (`aliasValueSchema` in @pt/contracts): trimmed, every whitespace run
// collapsed to one space, no control characters, 1 to 30 characters.
//
// The character classes are spelled out (not \s or [[:cntrl:]], which depend
// on the database locale): CONTROL is \p{Cc}, SPACE is what JavaScript's \s
// and String.prototype.trim() treat as whitespace once the controls are left
// out. A value is words of other characters joined by single spaces.
//
// Existing rows are brought into that shape first, the same way the schema
// would have stored them; a row left empty was a cleared nickname, which has
// no row, so it is deleted. Only stricter: every value the API writes already
// passes, so the previous API version keeps working.
//
// Frozen copy: the data script (scripts/migrate/account-refs.ts) scans the
// source with the same rule; a test checks the two agree.

export const NICKNAME_CONTROL = "\\u0000-\\u001f\\u007f-\\u009f";
export const NICKNAME_SPACE =
  " \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
const WORD = `[^${NICKNAME_CONTROL}${NICKNAME_SPACE}]+`;

export const NICKNAME_PATTERN = `^${WORD}( ${WORD})*$`;

const OLD_CHECK = `char_length("nickname") BETWEEN 1 AND 30`;
const NEW_CHECK = `char_length("nickname") BETWEEN 1 AND 30 AND "nickname" ~ '${NICKNAME_PATTERN}'`;

export class ChatNicknameValue1796000000000 implements MigrationInterface {
  name = "ChatNicknameValue1796000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dropped first: a repaired value may be empty for a moment.
    await queryRunner.query(
      `ALTER TABLE "chat_nicknames" DROP CONSTRAINT "chat_nicknames_nickname_length"`,
    );
    // Controls and whitespace runs (tabs and newlines are controls) become one
    // space, then the ends are trimmed.
    await queryRunner.query(`
      UPDATE "chat_nicknames"
      SET "nickname" = regexp_replace(
        regexp_replace("nickname", '[${NICKNAME_CONTROL}${NICKNAME_SPACE}]+', ' ', 'g'),
        '^ | $', '', 'g')
      WHERE "nickname" !~ '${NICKNAME_PATTERN}'`);
    await queryRunner.query(
      `DELETE FROM "chat_nicknames" WHERE "nickname" = ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_nicknames" ADD CONSTRAINT "chat_nicknames_nickname_value" CHECK (${NEW_CHECK})`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The repaired values stay repaired; only the rule is loosened again.
    await queryRunner.query(
      `ALTER TABLE "chat_nicknames" DROP CONSTRAINT "chat_nicknames_nickname_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_nicknames" ADD CONSTRAINT "chat_nicknames_nickname_length" CHECK (${OLD_CHECK})`,
    );
  }
}
