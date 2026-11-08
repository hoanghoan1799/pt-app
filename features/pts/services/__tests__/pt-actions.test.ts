import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, users } from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown, isSuper: true }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));
vi.mock("@/services/auth-guard", () => ({
  requireSuperAdmin: vi.fn(async () => {
    if (!state.isSuper) {
      const { redirect } = await import("next/navigation");

      redirect("/admin");
    }
    return { id: 1, role: "super_admin" };
  }),
}));

const { createPtAction, setAdminVerifiedAction, assignTraineePtAction } =
  await import("@/features/pts/services/pt-actions");
const { verifyPassword } = await import("@/services/password");

let db: TestDb;

const toFormData = (fields: Record<string, string>) => {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
};

const addPt = async (name: string) => {
  const [row] = await db
    .insert(admins)
    .values({
      username: name,
      usernameKey: name,
      passwordHash: "x",
      role: "pt",
    })
    .returning({ id: admins.id });

  return row.id;
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.isSuper = true;
});

describe("createPtAction", () => {
  it("creates a PT with a hashed password and no tick", async () => {
    const result = await createPtAction(
      INITIAL_FORM_STATE,
      toFormData({ username: "Coach.An", password: "long-enough-1" }),
    );

    expect(result.status).toBe("success");
    const [row] = await db.select().from(admins);

    expect(row).toMatchObject({
      username: "Coach.An",
      usernameKey: "coach.an",
      role: "pt",
      verifiedAt: null,
    });
    expect(row.passwordHash).not.toContain("long-enough-1");
    expect(await verifyPassword("long-enough-1", row.passwordHash)).toBe(true);
  });

  it("rejects a bad username and a short password with field errors", async () => {
    const result = await createPtAction(
      INITIAL_FORM_STATE,
      toFormData({ username: "a b", password: "short" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.username).toBeTruthy();
    expect(result.fieldErrors?.password).toBeTruthy();
    expect(await db.select().from(admins)).toHaveLength(0);
  });

  it("rejects a duplicate username, case-insensitively", async () => {
    await addPt("coach");
    const result = await createPtAction(
      INITIAL_FORM_STATE,
      toFormData({ username: "COACH", password: "long-enough-1" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.username).toBeTruthy();
    expect(await db.select().from(admins)).toHaveLength(1);
  });

  it("refuses a PT caller and writes nothing", async () => {
    state.isSuper = false;
    const result = await createPtAction(
      INITIAL_FORM_STATE,
      toFormData({ username: "coach", password: "long-enough-1" }),
    ).catch((error: unknown) => error);

    expect(result).toMatchObject({
      digest: expect.stringContaining("REDIRECT"),
    });
    expect(await db.select().from(admins)).toHaveLength(0);
  });
});

describe("setAdminVerifiedAction", () => {
  it("grants and removes the tick", async () => {
    const id = await addPt("coach");

    expect(await setAdminVerifiedAction(id, true)).toEqual({
      status: "success",
    });
    expect((await db.select().from(admins))[0].verifiedAt).toBeInstanceOf(Date);
    await setAdminVerifiedAction(id, false);
    expect((await db.select().from(admins))[0].verifiedAt).toBeNull();
  });

  it("reports an unknown admin", async () => {
    expect((await setAdminVerifiedAction(99, true)).status).toBe("error");
  });
});

describe("assignTraineePtAction", () => {
  const addUser = async () =>
    (
      await db
        .insert(users)
        .values({ name: "Lan", nameKey: "lan" })
        .returning({ id: users.id })
    )[0].id;

  it("assigns and clears the PT of a trainee", async () => {
    const pt = await addPt("coach");
    const user = await addUser();

    expect((await assignTraineePtAction(user, pt)).status).toBe("success");
    const [assigned] = await db.select().from(users).where(eq(users.id, user));

    expect(assigned.ptAdminId).toBe(pt);
    await assignTraineePtAction(user, null);
    const [cleared] = await db.select().from(users).where(eq(users.id, user));

    expect(cleared.ptAdminId).toBeNull();
  });

  it("refuses a target that is not a PT account", async () => {
    const [boss] = await db
      .insert(admins)
      .values({
        username: "boss",
        usernameKey: "boss",
        passwordHash: "x",
        role: "super_admin",
      })
      .returning({ id: admins.id });
    const user = await addUser();

    expect((await assignTraineePtAction(user, boss.id)).status).toBe("error");
    expect((await db.select().from(users))[0].ptAdminId).toBeNull();
  });

  it("reports an unknown trainee", async () => {
    const pt = await addPt("coach");

    expect((await assignTraineePtAction(999, pt)).status).toBe("error");
  });
});
