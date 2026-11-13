import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run, type RunOptions } from "../scripts/migrate/run.js";
import { loadTursoColumns } from "../scripts/turso-columns.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import {
  AVATAR_WEBP_BYTES,
  createTursoFixture,
  type FixtureVariant,
  PNG_BYTES,
  SCRYPT_HASH,
  type TursoFixture,
  WEBP_BYTES,
} from "./support/turso-fixture.js";

const mapping = loadTursoColumns();
const tables = Object.keys(mapping.tables);

const cleanups: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

const setup = async (
  variant: FixtureVariant = "base",
  options: { migrated?: boolean } = {},
) => {
  const fixture: TursoFixture = await createTursoFixture(variant);
  const db: TestDatabase = await createTestDatabase(options);

  cleanups.push(fixture.cleanup, db.drop);
  return { fixture, db };
};

const migrate = async (
  fixture: TursoFixture,
  db: TestDatabase,
  extra: Partial<RunOptions> = {},
) => {
  const lines: string[] = [];
  const result = await run(
    {
      mode: "migrate",
      source: fixture.url,
      target: db.url,
      orphans: "report",
      reset: false,
      allowRemote: false,
      dropLegacyAttachments: true,
      dropLegacyNicknames: true,
      batchSize: 2,
      ...extra,
    },
    (line) => lines.push(line),
  );

  return { ...result, output: lines.join("\n") };
};

const count = async (db: TestDatabase, table: string) =>
  Number(
    (await db.dataSource.query(`SELECT count(*) AS n FROM "${table}"`))[0].n,
  );

const checksums = (report: {
  tables: { table: string; targetChecksum: string | null }[];
}) => Object.fromEntries(report.tables.map((t) => [t.table, t.targetChecksum]));

describe("data migration from a Turso/SQLite copy", () => {
  it("has fixture rows in every one of the 44 tables", async () => {
    const { fixture } = await setup();

    for (const table of tables) {
      const result = await fixture.client.execute(
        `SELECT count(*) AS n FROM "${table}"`,
      );

      expect(Number(result.rows[0].n), table).toBeGreaterThan(0);
    }
  });

  it("copies everything: equal counts and checksums, conversions applied", async () => {
    const { fixture, db } = await setup();
    const reportPath = join(tmpdir(), `pt-report-${Date.now()}.json`);
    const { exitCode, report, output } = await migrate(fixture, db, {
      reportPath,
    });

    expect(exitCode, output).toBe(0);
    expect(report.status).toBe("ok");
    expect(report.committed).toBe(true);
    // 44 source tables minus chat_nicknames (dropped, see DbChatSocial).
    expect(report.tables).toHaveLength(43);
    expect(report.droppedLegacy).toEqual([
      {
        item: "chat_messages.attachment_url / attachment_meta (messages)",
        count: 1,
      },
      { item: "chat_nicknames (rows)", count: 1 },
    ]);

    for (const row of report.tables) {
      const expected = Number(
        (
          await fixture.client.execute(
            `SELECT count(*) AS n FROM "${row.table}"`,
          )
        ).rows[0].n,
      );

      expect(row.match, row.table).toBe(true);
      expect(row.targetRows, row.table).toBe(expected);
      expect(await count(db, row.table), row.table).toBe(expected);
      expect(row.sourceChecksum).toBe(row.targetChecksum);
    }

    // Conversions, read back from PostgreSQL itself.
    const [user] = await db.dataSource.query(
      `SELECT * FROM users WHERE id = 1`,
    );

    expect(user.name).toBe("Nguyễn Văn Đạt");
    expect(user.food_note).toBe("Không ăn hải sản, thích gà");
    expect(user.password_hash).toBe(SCRYPT_HASH);
    expect(user.chat_enabled).toBe(true);
    expect(user.created_at).toEqual(new Date((1_700_000_000 + 2) * 1000));

    const [message] = await db.dataSource.query(
      `SELECT * FROM chat_messages WHERE id = 2`,
    );

    expect(message.created_at).toEqual(new Date(1_700_000_002_000));
    expect(message.silent).toBe(true);
    expect(message).not.toHaveProperty("attachment_meta");
    // Columns that closed a cycle or point at the same table were set afterwards.
    expect(message.reply_to_message_id).toBe(1);
    expect(message.photo_id).toBe(1);

    const [conversation] = await db.dataSource.query(
      `SELECT last_message_id FROM chat_conversations WHERE id = 1`,
    );
    const [post] = await db.dataSource.query(
      `SELECT photo_id FROM social_posts WHERE id = 1`,
    );
    const [dm] = await db.dataSource.query(
      `SELECT last_message_id FROM dm_conversations WHERE id = 1`,
    );

    expect(conversation.last_message_id).toBe(2);
    expect(post.photo_id).toBe(1);
    expect(dm.last_message_id).toBe(1);

    const [photo] = await db.dataSource.query(
      `SELECT data, size FROM chat_photos WHERE id = 1`,
    );

    expect(Buffer.compare(photo.data, WEBP_BYTES)).toBe(0);
    expect(photo.size).toBe(WEBP_BYTES.length);

    const subs = await db.dataSource.query(
      `SELECT kind FROM push_subscriptions`,
    );

    expect(subs).toEqual([{ kind: "web" }]);
    expect(report.deferredColumns).toEqual(
      expect.arrayContaining([
        "chat_messages.reply_to_message_id",
        "chat_conversations.last_message_id",
      ]),
    );

    // Whichever edge broke the post <-> photo cycle, both ends are linked.
    const [link] = await db.dataSource.query(
      `SELECT (SELECT photo_id FROM social_posts WHERE id = 1) AS post_photo,
              (SELECT post_id FROM social_post_photos WHERE id = 1) AS photo_post`,
    );

    expect(link).toEqual({ post_photo: 1, photo_post: 1 });

    // The avatar data URLs became rows of the avatar tables, decoded; the
    // version stayed in the owner row.
    const userAvatars = await db.dataSource.query(
      `SELECT user_id, mime, data, size, updated_at FROM user_avatars`,
    );
    const adminAvatars = await db.dataSource.query(
      `SELECT admin_id, mime, data, size, updated_at FROM admin_avatars`,
    );

    expect(userAvatars).toHaveLength(1);
    expect(userAvatars[0]).toMatchObject({
      user_id: 1,
      mime: "image/png",
      size: PNG_BYTES.length,
      updated_at: new Date((1_700_000_000 + 24) * 1000),
    });
    expect(Buffer.compare(userAvatars[0].data, PNG_BYTES)).toBe(0);
    expect(adminAvatars).toHaveLength(1);
    expect(adminAvatars[0]).toMatchObject({
      admin_id: 1,
      mime: "image/webp",
      size: AVATAR_WEBP_BYTES.length,
    });
    expect(Buffer.compare(adminAvatars[0].data, AVATAR_WEBP_BYTES)).toBe(0);
    expect(
      (
        await db.dataSource.query(
          `SELECT avatar_updated_at FROM users WHERE id = 1`,
        )
      )[0].avatar_updated_at,
    ).toEqual(new Date((1_700_000_000 + 24) * 1000));
    expect(
      report.avatars.map((row) => [row.table, row.targetRows, row.match]),
    ).toEqual([
      ["admin_avatars", 1, true],
      ["user_avatars", 1, true],
    ]);

    // Blob sizes are reported.
    expect(report.blobs.total.rows).toBe(4);
    expect(report.blobs.total.bytes).toBe(
      WEBP_BYTES.length + PNG_BYTES.length * 3,
    );

    // The JSON report is machine readable and holds no connection string.
    const written = readFileSync(reportPath, "utf8");

    expect(JSON.parse(written).tables).toHaveLength(43);
    expect(written).not.toContain(db.url);
  });

  it("continues identity sequences after max(id), also with gaps", async () => {
    const { fixture, db } = await setup();

    expect((await migrate(fixture, db)).exitCode).toBe(0);

    const identities: { table_name: string }[] = await db.dataSource.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND is_identity = 'YES' AND table_name <> 'sessions'`,
    );

    expect(identities).toHaveLength(31);

    for (const { table_name: table } of identities) {
      const [{ max }] = await db.dataSource.query(
        `SELECT max(id) AS max FROM "${table}"`,
      );
      const [{ next }] = await db.dataSource.query(
        `SELECT nextval(pg_get_serial_sequence('"${table}"', 'id')) AS next`,
      );

      expect(Number(next), table).toBe(Number(max) + 1);
    }
  });

  it("starts empty identity tables at 1", async () => {
    const { fixture, db } = await setup("sparse");
    const { exitCode, report } = await migrate(fixture, db);

    expect(exitCode).toBe(0);
    expect(await count(db, "exercises")).toBe(0);

    const [{ next }] = await db.dataSource.query(
      `SELECT nextval(pg_get_serial_sequence('"exercises"', 'id')) AS next`,
    );

    expect(Number(next)).toBe(1);
    // users has ids 1, 2 and 5: the next one is 6.
    expect(
      report.sequences.find((sequence) => sequence.table === "users"),
    ).toEqual({ table: "users", maxId: 5, next: 6, ok: true });
  });

  it("refuses a target that has rows unless --reset, and a second --reset run gives the same checksums", async () => {
    const { fixture, db } = await setup();
    const first = await migrate(fixture, db);

    expect(first.exitCode).toBe(0);

    const refused = await migrate(fixture, db);

    expect(refused.exitCode).toBe(1);
    expect(refused.report.status).toBe("aborted");
    expect(refused.output).toMatch(/already has rows/);
    expect(await count(db, "users")).toBe(3);

    const second = await migrate(fixture, db, { reset: true });

    expect(second.exitCode).toBe(0);
    expect(checksums(second.report)).toEqual(checksums(first.report));
    expect(await count(db, "users")).toBe(3);

    // Sequences were restarted by the reset and set again from the data.
    expect(second.report.sequences.every((sequence) => sequence.ok)).toBe(true);
  });

  it("refuses a target with pending migrations", async () => {
    const { fixture, db } = await setup("base", { migrated: false });
    const { exitCode, output } = await migrate(fixture, db);

    expect(exitCode).toBe(1);
    expect(output).toMatch(/pending migrations/);
  });

  it("refuses a remote source without --allow-remote and never prints the token", async () => {
    const { db } = await setup();
    const token = "super-secret-token-value-123";
    const lines: string[] = [];
    const { exitCode, report } = await run(
      {
        mode: "migrate",
        source: `libsql://my-db-example.turso.io?authToken=${token}`,
        target: db.url,
        authToken: token,
        orphans: "report",
        reset: false,
        allowRemote: false,
        dropLegacyAttachments: true,
        dropLegacyNicknames: true,
        batchSize: 10,
      },
      (line) => lines.push(line),
    );
    const everything = JSON.stringify({ lines, report });

    expect(exitCode).toBe(1);
    expect(report.status).toBe("aborted");
    expect(lines.join("\n")).toMatch(/Refusing a remote source/);
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(db.url);
    expect(await count(db, "users")).toBe(0);
  });

  it("refuses a source file that does not exist instead of creating it", async () => {
    const { db } = await setup();
    const { exitCode, output } = await migrate(
      { url: "file:./definitely-missing-source.db" } as TursoFixture,
      db,
    );

    expect(exitCode).toBe(1);
    expect(output).toMatch(/does not exist/);
  });

  describe("orphans", () => {
    it("--orphans=report (default) aborts with the report and writes nothing", async () => {
      const { fixture, db } = await setup("required-orphans");
      const { exitCode, report, output } = await migrate(fixture, db);

      expect(exitCode).toBe(1);
      expect(report.status).toBe("aborted");
      expect(report.orphans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: "exercise_sets",
            column: "exercise_id",
            parentTable: "exercises",
            count: 1,
            sampleKeys: ["99"],
          }),
          expect.objectContaining({
            table: "meal_plan_meals",
            column: "day_id",
            count: 1,
          }),
        ]),
      );
      expect(output).toMatch(/Orphan report/);
      expect(await count(db, "users")).toBe(0);
      expect(await count(db, "exercise_sets")).toBe(0);
    });

    it("--orphans=skip loads the rest, lists every skipped row and still verifies", async () => {
      const { fixture, db } = await setup("required-orphans");
      const { exitCode, report } = await migrate(fixture, db, {
        orphans: "skip",
      });

      expect(exitCode).toBe(0);
      expect(report.skippedRows).toEqual(
        expect.arrayContaining([
          { table: "exercise_sets", keys: ["99"] },
          { table: "meal_plan_meals", keys: ["9"] },
          // The item of the skipped meal went with it.
          { table: "meal_plan_items", keys: ["9"] },
        ]),
      );
      expect(report.orphans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: "meal_plan_items",
            reason: "parent_skipped",
          }),
        ]),
      );
      expect(await count(db, "exercise_sets")).toBe(2);
      expect(await count(db, "meal_plan_items")).toBe(1);

      const exercise = report.tables.find((t) => t.table === "exercise_sets");

      expect(exercise).toMatchObject({
        sourceRows: 3,
        expectedRows: 2,
        targetRows: 2,
        match: true,
      });

      // Verify on its own needs the same flag to know what was skipped.
      const alone = await run(
        {
          mode: "verify",
          source: fixture.url,
          target: db.url,
          orphans: "skip",
          reset: false,
          allowRemote: false,
          dropLegacyAttachments: true,
          dropLegacyNicknames: true,
          batchSize: 5,
        },
        () => undefined,
      );

      expect(alone.exitCode).toBe(0);
    });

    it("--orphans=null repairs nullable columns, lists them, and refuses NOT NULL ones", async () => {
      const nullable = await setup("nullable-orphans");
      const result = await migrate(nullable.fixture, nullable.db, {
        orphans: "null",
      });

      expect(result.exitCode).toBe(0);
      expect(result.report.nulledValues).toEqual([
        { table: "users", column: "pt_admin_id", keys: ["6"] },
      ]);

      const [row] = await nullable.db.dataSource.query(
        `SELECT pt_admin_id FROM users WHERE id = 6`,
      );

      expect(row.pt_admin_id).toBeNull();
      expect(await count(nullable.db, "users")).toBe(4);

      const required = await setup("required-orphans");
      const refused = await migrate(required.fixture, required.db, {
        orphans: "null",
      });

      expect(refused.exitCode).toBe(1);
      expect(refused.output).toMatch(/cannot repair NOT NULL/);
      expect(await count(required.db, "users")).toBe(0);
    });
  });

  describe("account references and message rules (DbIntegrity)", () => {
    it("reports dangling text keys, user messages with an admin id", async () => {
      const { fixture, db } = await setup("dirty-keys");
      const { exitCode, report, output } = await migrate(fixture, db);

      expect(exitCode).toBe(1);
      expect(report.status).toBe("aborted");
      expect(report.orphans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: "social_comments",
            column: "author_user_id",
            parentTable: "users",
            reason: "missing_parent",
            sampleKeys: ["90"],
          }),
          expect.objectContaining({
            table: "social_comments",
            column: "author_key",
            reason: "malformed_key",
            sampleKeys: ["95"],
          }),
          expect.objectContaining({
            table: "chat_reads",
            column: "reader_key",
            reason: "malformed_key",
            sampleKeys: ["1:admin:x"],
          }),
          expect.objectContaining({
            table: "social_reactions",
            column: "reactor_admin_id",
            parentTable: "admins",
            sampleKeys: ["1:admin:9999"],
          }),
          expect.objectContaining({
            table: "social_reports",
            column: "target_user_id",
            sampleKeys: ["90"],
          }),
          expect.objectContaining({
            table: "chat_messages",
            column: "sender_admin_id",
            reason: "user_message_with_admin",
            sampleKeys: ["91"],
          }),
        ]),
      );
      expect(output).toMatch(/Orphan report/);
      expect(await count(db, "users")).toBe(0);
    });

    it("--orphans=skip drops those rows and their dependents and verifies", async () => {
      const { fixture, db } = await setup("dirty-keys");
      const { exitCode, report, output } = await migrate(fixture, db, {
        orphans: "skip",
      });

      expect(exitCode, output).toBe(0);
      expect(report.skippedRows).toEqual(
        expect.arrayContaining([
          {
            table: "social_comments",
            keys: expect.arrayContaining(["90", "95"]),
          },
          { table: "chat_reads", keys: ["1:admin:x"] },
          { table: "social_reactions", keys: ["1:admin:9999"] },
          { table: "social_reports", keys: ["90"] },
          { table: "chat_messages", keys: ["91"] },
          // The reaction on the skipped user message went with it.
          { table: "chat_reactions", keys: ["91:admin:1"] },
        ]),
      );

      expect(await count(db, "chat_messages")).toBe(2);
      expect(await count(db, "chat_reactions")).toBe(1);
      expect(report.tables.every((row) => row.match)).toBe(true);
    });

    it("--orphans=null cannot null a text key: it aborts and points at skip", async () => {
      const { fixture, db } = await setup("dirty-keys");
      const { exitCode, output } = await migrate(fixture, db, {
        orphans: "null",
      });

      expect(exitCode).toBe(1);
      expect(output).toMatch(/use --orphans=skip/);
      expect(output).toMatch(/social_comments\.author_user_id/);
      expect(await count(db, "users")).toBe(0);
    });
  });

  describe("chat and social rules (DbChatSocial)", () => {
    const base = {
      allowRemote: false,
      batchSize: 5,
      reset: false,
    } as const;

    it("aborts when the source still has legacy attachments or nicknames, and says which flag accepts the loss", async () => {
      const { fixture, db } = await setup();
      const result = await run(
        {
          ...base,
          mode: "dry-run",
          source: fixture.url,
          target: db.url,
          orphans: "report",
        },
        () => undefined,
      );
      const errors = result.report.errors.join("\n");

      expect(result.exitCode).toBe(1);
      expect(result.report.status).toBe("aborted");
      expect(errors).toMatch(
        /1 chat message\(s\) have attachment_url or attachment_meta.*--drop-legacy-attachments/s,
      );
      expect(errors).toMatch(
        /chat_nicknames has 1 row\(s\).*--drop-legacy-nicknames/s,
      );

      // One flag is not enough.
      const partial = await run(
        {
          ...base,
          mode: "dry-run",
          source: fixture.url,
          target: db.url,
          orphans: "report",
          dropLegacyAttachments: true,
        },
        () => undefined,
      );
      const partialErrors = partial.report.errors.join("\n");

      expect(partial.exitCode).toBe(1);
      expect(partialErrors).not.toMatch(/--drop-legacy-attachments/);
      expect(partialErrors).toMatch(/--drop-legacy-nicknames/);
      expect(await count(db, "users")).toBe(0);
    });

    it("reports every rule with table, column, rule and primary keys, never content", async () => {
      const { fixture, db } = await setup("chat-social-dirty");
      const { exitCode, report } = await migrate(fixture, db);
      const keys = (table: string, column: string, reason: string) =>
        report.orphans.find(
          (item) =>
            item.table === table &&
            item.column === column &&
            item.reason === reason,
        )?.sampleKeys;

      expect(exitCode).toBe(1);
      expect(report.status).toBe("aborted");
      expect(
        keys("chat_messages", "reply_to_message_id", "reply_in_other_conversation"),
      ).toEqual(["92"]);
      expect(
        keys("chat_conversations", "last_message_id", "last_message_in_other_conversation"),
      ).toEqual(["3"]);
      expect(keys("chat_photos", "message_id", "photo_link_mismatch")).toEqual(["92"]);
      expect(keys("chat_custom_stickers", "size", "size_not_byte_length")).toEqual(["92"]);
      expect(keys("social_friendships", "user_low", "pair_not_ordered")).toEqual(["5:2"]);
      expect(keys("dm_conversations", "user_low", "pair_not_ordered")).toEqual(["92"]);
      expect(
        keys("social_friendships", "requested_by", "requester_not_in_pair"),
      ).toEqual(["2:5"]);
      expect(keys("social_reports", "reporter_key", "duplicate_open_report")).toEqual(["93"]);
      expect(keys("social_reports", "status", "status_resolution_mismatch")).toEqual(["94"]);
      expect(await count(db, "users")).toBe(0);
    });

    it("--orphans=null cannot repair them and points at skip", async () => {
      const { fixture, db } = await setup("chat-social-dirty");
      const { exitCode, output } = await migrate(fixture, db, {
        orphans: "null",
      });

      expect(exitCode).toBe(1);
      expect(output).toMatch(/use --orphans=skip/);
      expect(output).toMatch(/chat_messages\.reply_to_message_id/);
    });

    it("--orphans=skip drops exactly those rows, repairs a NULL silent to false and verifies", async () => {
      const { fixture, db } = await setup("chat-social-dirty");
      const { exitCode, report, output } = await migrate(fixture, db, {
        orphans: "skip",
      });

      expect(exitCode, output).toBe(0);
      expect(report.skippedRows).toEqual(
        expect.arrayContaining([
          { table: "chat_messages", keys: ["92"] },
          { table: "chat_conversations", keys: ["3"] },
          { table: "chat_photos", keys: ["92"] },
          { table: "chat_custom_stickers", keys: ["92"] },
          {
            table: "social_friendships",
            keys: expect.arrayContaining(["5:2", "2:5"]),
          },
          { table: "dm_conversations", keys: ["92"] },
          {
            table: "social_reports",
            keys: expect.arrayContaining(["93", "94"]),
          },
        ]),
      );
      expect(report.tables.every((row) => row.match)).toBe(true);

      const [silent] = await db.dataSource.query(
        `SELECT silent FROM chat_messages WHERE id = 93`,
      );

      expect(silent.silent).toBe(false);
      // The first of the duplicate open reports stays.
      const reports: { id: number }[] = await db.dataSource.query(
        `SELECT id FROM social_reports ORDER BY id`,
      );

      expect(reports.map((row) => row.id)).toEqual([1, 92]);
    });

    it("recomputes last_message_id / last_message_at after the load and warns about a difference", async () => {
      const { fixture, db } = await setup();
      const flags = { dropLegacyAttachments: true, dropLegacyNicknames: true };
      const first = await migrate(fixture, db, flags);

      expect(first.exitCode, first.output).toBe(0);
      expect(first.report.derivedChecks.map((check) => check.count)).toEqual([
        0, 0,
      ]);

      await db.dataSource.query(
        `UPDATE chat_conversations SET last_message_id = NULL`,
      );
      const verify = await run(
        {
          ...base,
          ...flags,
          mode: "verify",
          source: fixture.url,
          target: db.url,
          orphans: "report",
        },
        () => undefined,
      );

      expect(verify.report.derivedChecks[0]).toMatchObject({
        table: "chat_conversations",
        count: 1,
        sampleIds: ["1"],
      });
      expect(verify.report.warnings.join("\n")).toMatch(
        /chat_conversations: 1 conversation/,
      );
    });
  });

  it("aborts on values PostgreSQL would reject, and writes nothing", async () => {
    const { fixture, db } = await setup("invalid-enum");
    const { exitCode, report } = await migrate(fixture, db);

    expect(exitCode).toBe(1);
    expect(report.status).toBe("aborted");
    expect(report.invalidValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "users",
          column: "post_privacy_default",
          count: 1,
        }),
      ]),
    );
    expect(await count(db, "users")).toBe(0);
  });

  it("loads, skips and reports unusable avatars (the owner rows still load)", async () => {
    const { fixture, db } = await setup("bad-avatars");
    const { exitCode, report, output } = await migrate(fixture, db);

    expect(exitCode, output).toBe(0);
    expect(report.status).toBe("ok");
    expect(report.committed).toBe(true);
    expect(report.invalidValues).toEqual([]);
    expect(
      report.skippedAvatars
        .map((item) => [item.table, item.id])
        .sort((x, y) => (x.join() < y.join() ? -1 : 1)),
    ).toEqual([
      ["admins", "3"],
      ["users", "2"],
      ["users", "5"],
    ]);

    const problems = report.skippedAvatars
      .map((item) => item.problem)
      .join("\n");

    expect(problems).toMatch(/not a base64 image data URL/);
    expect(problems).toMatch(/bytes are not a png, jpeg or webp image/);
    expect(problems).toMatch(/avatar_updated_at/);
    expect(report.warnings.join("\n")).toMatch(/3 unusable avatar/);
    // Never the value itself.
    expect(output).not.toContain("PHNjcmlwdD4");
    expect(JSON.stringify(report)).not.toContain("PHNjcmlwdD4");

    // Owner rows loaded, without a version; only the good avatar was copied.
    expect(await count(db, "users")).toBe(3);
    expect(await count(db, "admins")).toBe(2);
    expect(
      await db.dataSource.query(
        `SELECT id FROM users WHERE avatar_updated_at IS NOT NULL ORDER BY id`,
      ),
    ).toEqual([{ id: 1 }]);
    expect(
      await db.dataSource.query(
        `SELECT id FROM admins WHERE avatar_updated_at IS NOT NULL`,
      ),
    ).toEqual([{ id: 1 }]);
    expect(
      await db.dataSource.query(`SELECT user_id FROM user_avatars`),
    ).toEqual([{ user_id: 1 }]);
    expect(
      await db.dataSource.query(`SELECT admin_id FROM admin_avatars`),
    ).toEqual([{ admin_id: 1 }]);
    expect(report.avatars.every((row) => row.match)).toBe(true);
    expect(report.tables.every((row) => row.match)).toBe(true);

    // verify expects exactly the skipped ids to be missing...
    const lines: string[] = [];
    const verified = await run(
      {
        mode: "verify",
        source: fixture.url,
        target: db.url,
        orphans: "report",
        reset: false,
        allowRemote: false,
        dropLegacyAttachments: true,
        dropLegacyNicknames: true,
        batchSize: 3,
      },
      (line) => lines.push(line),
    );

    expect(verified.exitCode, lines.join("\n")).toBe(0);

    // ...and fails when a skipped id gets an avatar after all.
    await db.dataSource.query(
      `INSERT INTO user_avatars (user_id, mime, data, size, updated_at)
       SELECT 2, mime, data, size, updated_at FROM user_avatars WHERE user_id = 1`,
    );
    const extra = await run(
      {
        mode: "verify",
        source: fixture.url,
        target: db.url,
        orphans: "report",
        reset: false,
        allowRemote: false,
        dropLegacyAttachments: true,
        dropLegacyNicknames: true,
        batchSize: 3,
      },
      () => undefined,
    );

    expect(extra.exitCode).toBe(1);
    expect(
      extra.report.avatars.filter((row) => !row.match).map((row) => row.table),
    ).toEqual(["user_avatars"]);
  });

  it("--dry-run reads and scans but writes nothing", async () => {
    const { fixture, db } = await setup("required-orphans");
    const { exitCode, report } = await migrate(fixture, db, {
      mode: "dry-run",
      orphans: "skip",
    });

    expect(exitCode).toBe(0);
    expect(report.skippedRows.length).toBeGreaterThan(0);
    expect(await count(db, "users")).toBe(0);
  });

  describe("constraints of the db-constraints migration", () => {
    const rules = (
      groups: {
        table: string;
        column: string;
        rule: string;
        sampleKeys: string[];
      }[],
    ) =>
      Object.fromEntries(
        groups.map((group) => [
          `${group.table}.${group.column}:${group.rule}`,
          group.sampleKeys,
        ]),
      );

    it("converts NULLs to the new defaults, lists them, and loads days as dates", async () => {
      const { fixture, db } = await setup();
      const { exitCode, report, output } = await migrate(fixture, db);

      expect(exitCode, output).toBe(0);
      expect(
        Object.fromEntries(
          report.backfilledValues.map((item) => [
            `${item.table}.${item.column}`,
            { value: item.value, keys: item.sampleKeys },
          ]),
        ),
      ).toMatchObject({
        "admins.role": { value: "super_admin", keys: ["1"] },
        "users.chat_enabled": { value: 0, keys: ["5"] },
        "users.post_privacy_default": { value: "friends" },
      });

      const [admin] = await db.dataSource.query(
        `SELECT role FROM admins WHERE id = 1`,
      );
      const [day] = await db.dataSource.query(
        `SELECT date FROM workout_days WHERE id = 1`,
      );
      const [exercise] = await db.dataSource.query(
        `SELECT user_id FROM exercises WHERE id = 1`,
      );
      const [meal] = await db.dataSource.query(
        `SELECT user_id FROM meal_plan_meals WHERE id = 1`,
      );

      expect(admin.role).toBe("super_admin");
      expect(day.date).toBe("2026-11-10");
      // Exercises and meals take the owner of their day.
      expect(exercise.user_id).toBe(1);
      expect(meal.user_id).toBe(1);
    });

    it("reports every kind of violation with ids, and aborts without --orphans=skip", async () => {
      const { fixture, db } = await setup("constraint-violations");
      const result = await migrate(fixture, db, { mode: "dry-run" });

      expect(result.exitCode).toBe(1);
      expect(result.report.status).toBe("aborted");
      expect(rules(result.report.constraintViolations)).toEqual({
        "workout_days.date:date": ["20"],
        "exercises.position:exercises_day_position_key": ["21"],
        "exercise_sets.user_id:exercise_sets_exercise_owner_fkey": ["21"],
        "exercise_sets.reps:exercise_sets_reps_range": ["22"],
        "meal_logs.grams:meal_logs_grams_range": ["21"],
        "meal_logs.food_id:meal_logs_food_or_name": ["22"],
        "meal_mark_items.meal_id:meal_mark_items_mark_meal_fkey": ["21"],
        "weight_logs.weight_kg:weight_logs_weight_range": ["21"],
      });
      expect(result.output).toMatch(/Rows that break a new constraint/);
      expect(result.output).toMatch(/--orphans=skip/);
      expect(await count(db, "users")).toBe(0);
    });

    it("--orphans=null cannot repair them", async () => {
      const { fixture, db } = await setup("constraint-violations");
      const result = await migrate(fixture, db, { orphans: "null" });

      expect(result.exitCode).toBe(1);
      expect(result.output).toMatch(
        /cannot repair a value that breaks a constraint/,
      );
      expect(await count(db, "users")).toBe(0);
    });

    it("--orphans=skip leaves the rows and their dependents out and still verifies", async () => {
      const { fixture, db } = await setup("constraint-violations");
      const result = await migrate(fixture, db, { orphans: "skip" });

      expect(result.exitCode, result.output).toBe(0);
      expect(
        Object.fromEntries(
          result.report.skippedRows.map((row) => [
            row.table,
            [...row.keys].sort(),
          ]),
        ),
      ).toMatchObject({
        workout_days: ["20"],
        // The exercise of the skipped day, and the duplicate position.
        exercises: ["20", "21"],
        // Its set, the other owner's, the out-of-range one.
        exercise_sets: ["21", "22", "30"],
        meal_logs: ["21", "22"],
        meal_mark_items: ["21"],
        weight_logs: ["21"],
      });
      expect(await count(db, "exercises")).toBe(2);
      expect(await count(db, "exercise_sets")).toBe(2);
      expect(result.report.tables.every((table) => table.match)).toBe(true);

      const alone = await run(
        {
          mode: "verify",
          source: fixture.url,
          target: db.url,
          orphans: "skip",
          reset: false,
          allowRemote: false,
          dropLegacyAttachments: true,
          dropLegacyNicknames: true,
          batchSize: 5,
        },
        () => undefined,
      );

      expect(alone.exitCode).toBe(0);
    });
  });

  describe("verify", () => {
    const verify = async (fixture: TursoFixture, db: TestDatabase) => {
      const lines: string[] = [];
      const result = await run(
        {
          mode: "verify",
          source: fixture.url,
          target: db.url,
          orphans: "report",
          reset: false,
          allowRemote: false,
          dropLegacyAttachments: true,
          dropLegacyNicknames: true,
          batchSize: 3,
        },
        (line) => lines.push(line),
      );

      return { ...result, output: lines.join("\n") };
    };

    it("passes on a clean copy, and fails when a PostgreSQL row is altered", async () => {
      const { fixture, db } = await setup();

      expect((await migrate(fixture, db)).exitCode).toBe(0);
      expect((await verify(fixture, db)).exitCode).toBe(0);

      // One character of a password hash.
      await db.dataSource.query(
        `UPDATE users SET password_hash = replace(password_hash, 'q9Yk', 'q9Yj') WHERE id = 2 OR id = 1`,
      );

      const hash = await verify(fixture, db);

      expect(hash.exitCode).toBe(1);
      expect(
        hash.report.tables.filter((t) => !t.match).map((t) => t.table),
      ).toEqual(["users"]);
      expect(hash.output).toMatch(/MISMATCH/);
    });

    it("detects a changed blob byte, a changed timestamp and a missing row", async () => {
      const { fixture, db } = await setup();

      expect((await migrate(fixture, db)).exitCode).toBe(0);

      await db.dataSource.query(
        `UPDATE chat_photos SET data = set_byte(data, 5, 1) WHERE id = 1`,
      );
      await db.dataSource.query(
        `UPDATE exercise_completions SET completed_at = completed_at + interval '1 millisecond'`,
      );
      await db.dataSource.query(`DELETE FROM weight_logs`);

      const { exitCode, report } = await verify(fixture, db);

      expect(exitCode).toBe(1);
      expect(
        report.tables
          .filter((t) => !t.match)
          .map((t) => t.table)
          .sort(),
      ).toEqual(["chat_photos", "exercise_completions", "weight_logs"]);
      expect(
        report.tables.find((t) => t.table === "weight_logs")?.targetRows,
      ).toBe(0);
    });

    it("detects a changed avatar byte, a changed version and a missing avatar row", async () => {
      const { fixture, db } = await setup();

      expect((await migrate(fixture, db)).exitCode).toBe(0);
      expect((await verify(fixture, db)).exitCode).toBe(0);

      await db.dataSource.query(
        `UPDATE user_avatars SET data = set_byte(data, 9, 1) WHERE user_id = 1`,
      );
      await db.dataSource.query(`DELETE FROM admin_avatars`);

      const { exitCode, report } = await verify(fixture, db);

      expect(exitCode).toBe(1);
      expect(
        report.avatars.filter((row) => !row.match).map((row) => row.table),
      ).toEqual(["admin_avatars", "user_avatars"]);
      // The owner tables themselves still match: the avatar is not in their hash.
      expect(report.tables.every((row) => row.match)).toBe(true);

      await db.dataSource.query(
        `UPDATE user_avatars SET data = set_byte(data, 9, get_byte(data, 9) # 1) WHERE user_id = 1`,
      );
      await db.dataSource.query(
        `UPDATE users SET avatar_updated_at = avatar_updated_at + interval '1 second' WHERE id = 1`,
      );

      const version = await verify(fixture, db);

      expect(
        version.report.tables.filter((row) => !row.match).map((r) => r.table),
      ).toEqual(["users"]);
    });

    it("fails when an identity sequence was not advanced", async () => {
      const { fixture, db } = await setup();

      expect((await migrate(fixture, db)).exitCode).toBe(0);
      await db.dataSource.query(
        `SELECT setval(pg_get_serial_sequence('"users"', 'id'), 1)`,
      );

      const { exitCode, report } = await verify(fixture, db);

      expect(exitCode).toBe(1);
      expect(report.sequences.filter((s) => !s.ok).map((s) => s.table)).toEqual(
        ["users"],
      );
    });
  });
});
