import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Admin } from "../src/database/entities/admin.entity.js";
import { User } from "../src/database/entities/user.entity.js";
import { migrations } from "../src/migrations/index.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import { PNG_BASE64, PNG_URL } from "./support/http.js";
import { insertRow } from "./support/rows.js";

const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([1, 2, 3, 4]),
  Buffer.from("WEBPVP8 "),
  Buffer.alloc(300, 0xab),
]);
const WEBP_URL = `data:image/webp;base64,${WEBP_BYTES.toString("base64")}`;
const UPDATED = new Date("2026-05-01T08:30:15.000Z");

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase({ migrated: false });
});

afterAll(async () => {
  await db.drop();
});

const columnsOf = async (table: string) =>
  (
    (await db.dataSource.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [table],
    )) as { column_name: string }[]
  ).map((row) => row.column_name);

describe("AvatarTables migration", () => {
  it("moves data-URL avatars into the new tables, skips unusable values and reverts", async () => {
    const ds = db.dataSource;
    const last = migrations.at(-1)!;

    await ds.runMigrations({ transaction: "each" });
    // Back to the schema before it: avatars are columns again.
    await ds.undoLastMigration({ transaction: "each" });
    expect(await columnsOf("users")).toContain("avatar");

    const ids = {
      png: await insertRow(ds, User, {}),
      none: await insertRow(ds, User, {}),
      broken: await insertRow(ds, User, {}),
      wrongMime: await insertRow(ds, User, {}),
      unversioned: await insertRow(ds, User, {}),
      webpAdmin: await insertRow(ds, Admin, { role: "pt" }),
      plainAdmin: await insertRow(ds, Admin, { role: "pt" }),
    };
    const set = (
      table: string,
      id: number,
      avatar: string | null,
      at: Date | null,
    ) =>
      ds.query(
        `UPDATE ${table} SET avatar = $2, avatar_updated_at = $3 WHERE id = $1`,
        [id, avatar, at],
      );

    await set("users", ids.png, PNG_URL, UPDATED);
    await set("users", ids.broken, "data:image/png;base64,@@@@", UPDATED);
    await set("users", ids.wrongMime, "data:text/html;base64,AAAA", UPDATED);
    await set("users", ids.unversioned, PNG_URL, null);
    await set("admins", ids.webpAdmin, WEBP_URL, UPDATED);

    await ds.runMigrations({ transaction: "each" });

    expect(await columnsOf("users")).not.toContain("avatar");
    expect(await columnsOf("admins")).not.toContain("avatar");
    expect(await columnsOf("users")).toContain("avatar_updated_at");

    const users: {
      user_id: number;
      mime: string;
      data: Buffer;
      size: number;
      updated_at: Date;
    }[] = await ds.query(`SELECT * FROM user_avatars ORDER BY user_id`);

    // Only the valid one: broken, wrong-type, unversioned and null are not copied.
    expect(users.map((row) => row.user_id)).toEqual([ids.png]);
    const png = users.find((row) => row.user_id === ids.png)!;

    expect(png.mime).toBe("image/png");
    expect(Buffer.compare(png.data, Buffer.from(PNG_BASE64, "base64"))).toBe(0);
    expect(png.size).toBe(png.data.length);
    expect(png.updated_at).toEqual(UPDATED);
    // Unusable avatars leave no version behind, so no avatar URL is built.
    const versions: { id: number; avatar_updated_at: Date | null }[] =
      await ds.query(`SELECT id, avatar_updated_at FROM users ORDER BY id`);
    const versionOf = (id: number) =>
      versions.find((row) => row.id === id)?.avatar_updated_at;

    expect(versionOf(ids.png)).toEqual(UPDATED);
    expect(versionOf(ids.broken)).toBeNull();
    expect(versionOf(ids.wrongMime)).toBeNull();
    expect(versionOf(ids.unversioned)).toBeNull();
    expect(versionOf(ids.none)).toBeNull();

    const admins: {
      admin_id: number;
      mime: string;
      data: Buffer;
      size: number;
    }[] = await ds.query(`SELECT * FROM admin_avatars`);

    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({
      admin_id: ids.webpAdmin,
      mime: "image/webp",
      size: WEBP_BYTES.length,
    });
    expect(Buffer.compare(admins[0].data, WEBP_BYTES)).toBe(0);

    // The version column was not touched.
    const [version] = await ds.query(
      `SELECT avatar_updated_at FROM users WHERE id = $1`,
      [ids.png],
    );

    expect(version.avatar_updated_at).toEqual(UPDATED);

    // Reverting rebuilds the data URLs, byte for byte.
    await ds.undoLastMigration({ transaction: "each" });
    const [back] = await ds.query(`SELECT avatar FROM users WHERE id = $1`, [
      ids.png,
    ]);
    const [backAdmin] = await ds.query(
      `SELECT avatar FROM admins WHERE id = $1`,
      [ids.webpAdmin],
    );

    expect(back.avatar).toBe(PNG_URL);
    expect(backAdmin.avatar).toBe(WEBP_URL);
    expect(last.name).toBe("AvatarTables1795000000000");
    await ds.runMigrations({ transaction: "each" });
  });
});
