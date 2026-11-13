import type { INestApplication } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Clock } from "../src/common/clock.js";
import { UserAvatar } from "../src/database/entities/user-avatar.entity.js";
import { BytesInPostgresStorage } from "../src/files/bytes-in-postgres.storage.js";
import { createTestApp } from "./support/app.js";
import {
  FakeClock,
  seedAdmin,
  seedUser,
} from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";
import { PNG_BASE64 } from "./support/http.js";

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
