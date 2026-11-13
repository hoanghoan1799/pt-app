import type { INestApplication } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { Admin } from "../src/database/entities/admin.entity.js";
import { ChatNickname } from "../src/database/entities/chat-nickname.entity.js";
import { ContactAlias } from "../src/database/entities/contact-alias.entity.js";
import { UserAvatar } from "../src/database/entities/user-avatar.entity.js";
import { BytesInPostgresStorage } from "../src/files/bytes-in-postgres.storage.js";
import {
  moveChatNicknamesToAliases,
  verifyExistingSuperAdmins,
} from "../src/scripts/data-fixes.js";
import { createTestApp } from "./support/app.js";
import {
  FakeClock,
  seedAdmin,
  seedConversation,
  seedUser,
} from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import { PNG_BASE64 } from "./support/http.js";
import { insertRow } from "./support/rows.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let storage: BytesInPostgresStorage;
const clock = new FakeClock();

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [{ token: Clock, value: clock }],
  });
  storage = new BytesInPostgresStorage(ds, clock);
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe("BytesInPostgresStorage", () => {
  const png = Buffer.from(PNG_BASE64, "base64");

  it("stores, reads back and removes a user's photo", async () => {
    const user = await seedUser(ds);
    const ref = { collection: "avatar-user" as const, id: user.id };

    expect(await storage.get(ref)).toBeNull();
    expect(await storage.version(ref)).toBeNull();
    const version = await storage.put(ref, { mime: "image/png", bytes: png });

    expect(version.getTime()).toBe(
      Math.floor(clock.now().getTime() / 1000) * 1000,
    );
    const stored = await storage.get(ref);

    expect(stored?.mime).toBe("image/png");
    expect(stored?.bytes.equals(png)).toBe(true);
    expect(stored?.version.getTime()).toBe(version.getTime());
    expect((await storage.version(ref))?.getTime()).toBe(version.getTime());
    // Kept in its own table, next to the version column of the owner.
    const row = await ds.getRepository(UserAvatar).findOneByOrFail({
      userId: user.id,
    });

    expect(row.mime).toBe("image/png");
    expect(row.data.equals(png)).toBe(true);
    expect(row.size).toBe(png.length);
    await storage.remove(ref);
    expect(await storage.get(ref)).toBeNull();
  });

  it("keeps users and admins apart", async () => {
    const user = await seedUser(ds);
    const admin = await seedAdmin(ds);

    await storage.put(
      { collection: "avatar-admin", id: admin.id },
      { mime: "image/png", bytes: png },
    );

    expect(
      await storage.get({ collection: "avatar-user", id: user.id }),
    ).toBeNull();
    expect(
      await storage.get({ collection: "avatar-admin", id: admin.id }),
    ).not.toBeNull();
    expect(
      await storage.get({ collection: "avatar-admin", id: 99999 }),
    ).toBeNull();
  });

  it("refuses bytes that do not match the declared type", async () => {
    const user = await seedUser(ds);

    await expect(
      storage.put(
        { collection: "avatar-user", id: user.id },
        { mime: "image/jpeg", bytes: png },
      ),
    ).rejects.toThrow();
    expect(
      await storage.get({ collection: "avatar-user", id: user.id }),
    ).toBeNull();
  });

  it("does not return a stored value that is not an image", async () => {
    const user = await seedUser(ds);

    await ds.getRepository(UserAvatar).insert({
      userId: user.id,
      mime: "image/png",
      data: Buffer.from("<script>"),
      size: 8,
      updatedAt: new Date(),
    });

    expect(
      await storage.get({ collection: "avatar-user", id: user.id }),
    ).toBeNull();
  });
});

describe("verifyExistingSuperAdmins", () => {
  it("gives roleless admins the super_admin role and the tick, once, and leaves PTs alone", async () => {
    const legacy = await seedAdmin(ds, { role: null });
    const pt = await seedAdmin(ds, { role: "pt" });
    const now = new Date("2026-11-12T10:00:00.000Z");

    expect(await verifyExistingSuperAdmins(ds, now)).toBeGreaterThanOrEqual(1);
    expect(
      await ds.getRepository(Admin).findOneByOrFail({ id: legacy.id }),
    ).toMatchObject({
      role: "super_admin",
      verifiedAt: now,
    });
    expect(
      await ds.getRepository(Admin).findOneByOrFail({ id: pt.id }),
    ).toMatchObject({
      role: "pt",
      verifiedAt: null,
    });
    // A tick removed later is not granted again.
    await ds
      .getRepository(Admin)
      .update({ id: legacy.id }, { verifiedAt: null });
    expect(await verifyExistingSuperAdmins(ds, now)).toBe(0);
    expect(
      (await ds.getRepository(Admin).findOneByOrFail({ id: legacy.id }))
        .verifiedAt,
    ).toBeNull();
  });
});

describe("moveChatNicknamesToAliases", () => {
  it("copies usable shared nicknames to the setter's aliases, keeps existing ones and empties the legacy table", async () => {
    await ds.getRepository(ChatNickname).clear();
    const user = await seedUser(ds);
    const admin = await seedAdmin(ds);
    const conversationId = await seedConversation(ds, user.id);
    const at = new Date("2026-01-01T00:00:00.000Z");
    const second = await seedConversation(ds, (await seedUser(ds)).id);
    const nick = (
      targetKey: string,
      setByKey: string,
      nickname: string,
      conversation = conversationId,
    ) =>
      insertRow(ds, ChatNickname, {
        conversationId: conversation,
        targetKey,
        setByKey,
        nickname,
        updatedAt: at,
      });

    await nick("pt", "user", "Coach");
    await nick("user", `admin:${admin.id}`, "Champ");
    // Unusable: an admin naming the PT side, an empty value.
    await nick("pt", `admin:${admin.id}`, "Nope", second);
    await nick(`admin:${admin.id}`, "user", "   ", second);
    await ds.getRepository(ContactAlias).save({
      ownerKey: `user:${user.id}`,
      targetKey: "pt",
      alias: "Already mine",
      updatedAt: at,
    });

    const created = await moveChatNicknamesToAliases(ds);
    const aliases = await ds
      .getRepository(ContactAlias)
      .find({ order: { ownerKey: "ASC" } });

    expect(created).toBe(1);
    expect(
      aliases.map((a) => [a.ownerKey, a.targetKey, a.alias]).sort(),
    ).toEqual(
      [
        [`admin:${admin.id}`, `user:${user.id}`, "Champ"],
        [`user:${user.id}`, "pt", "Already mine"],
      ].sort(),
    );
    expect(await ds.getRepository(ChatNickname).count()).toBe(0);
    expect(await moveChatNicknamesToAliases(ds)).toBe(0);
  });
});
