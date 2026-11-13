import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run, type RunOptions } from "../scripts/migrate/run.js";
import { loadTursoColumns } from "../scripts/turso-columns.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import {
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
    expect(report.tables).toHaveLength(44);

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
    expect(message.attachment_meta).toBe(
      '{"width":640,"height":480,"alt":"ảnh"}',
    );
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

    // Blob sizes are reported.
    expect(report.blobs.total.rows).toBe(4);
    expect(report.blobs.total.bytes).toBe(
      WEBP_BYTES.length + PNG_BYTES.length * 3,
    );

    // The JSON report is machine readable and holds no connection string.
    const written = readFileSync(reportPath, "utf8");

    expect(JSON.parse(written).tables).toHaveLength(44);
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
          { table: "social_comments", keys: ["90"] },
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
