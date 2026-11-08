import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins } from "@/db/schema";
import { verifyExistingSuperAdmins } from "@/features/auth/services/verify-existing-admins";

let db: TestDb;

const addAdmin = async (
  name: string,
  role: "pt" | "super_admin" | null,
  verifiedAt: Date | null = null,
) => {
  await db.insert(admins).values({
    username: name,
    usernameKey: name,
    passwordHash: "x",
    role,
    verifiedAt,
  });
};

const find = async (name: string) =>
  (await db.select().from(admins).where(eq(admins.usernameKey, name)))[0];

beforeEach(async () => {
  db = await createTestDb();
});

describe("verifyExistingSuperAdmins", () => {
  it("gives role-less admins the super_admin role and the tick, leaving PTs alone", async () => {
    const now = new Date("2026-11-08T10:00:00Z");

    await addAdmin("legacy", null);
    await addAdmin("pt", "pt");

    expect(await verifyExistingSuperAdmins(db, now)).toBe(1);
    const legacy = await find("legacy");

    expect(legacy.role).toBe("super_admin");
    expect(legacy.verifiedAt).toEqual(now);
    const pt = await find("pt");

    expect(pt.role).toBe("pt");
    expect(pt.verifiedAt).toBeNull();
  });

  it("is idempotent and does not re-grant a tick the super admin removed", async () => {
    await addAdmin("legacy", null);
    await verifyExistingSuperAdmins(db);
    await db.update(admins).set({ verifiedAt: null });

    expect(await verifyExistingSuperAdmins(db)).toBe(0);
    expect((await find("legacy")).verifiedAt).toBeNull();
  });

  it("keeps an explicit super admin as it is", async () => {
    const when = new Date("2026-01-01T00:00:00Z");

    await addAdmin("boss", "super_admin", when);

    expect(await verifyExistingSuperAdmins(db)).toBe(0);
    expect((await find("boss")).verifiedAt).toEqual(when);
  });
});
