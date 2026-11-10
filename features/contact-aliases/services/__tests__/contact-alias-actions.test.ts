import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  contactAliases,
  socialBlocks,
  users,
} from "@/db/schema";
import { ALIAS_MESSAGES } from "@/features/contact-aliases/constants/messages";
import { TERMS_VERSION } from "@/features/social/constants/social";

const state = vi.hoisted(() => ({
  db: null as unknown,
  userId: 0,
  adminId: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => false),
}));
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => ({ id: state.userId })),
  requireAdmin: vi.fn(async () => ({ id: state.adminId })),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const actions =
  await import("@/features/contact-aliases/services/contact-alias-actions");
const service =
  await import("@/features/contact-aliases/services/contact-aliases");

let db: TestDb;
let superId: number;
let ptA: number;
let ptB: number;
let alice: number; // PT A's trainee
let bob: number; // PT B's trainee
let carol: number; // PT A's trainee

const addAdmin = async (name: string, role: "pt" | "super_admin") =>
  (
    await db
      .insert(admins)
      .values({ username: name, usernameKey: name, passwordHash: "x", role })
      .returning({ id: admins.id })
  )[0].id;

const addUser = async (
  name: string,
  ptAdminId: number | null,
  termsVersion: number | null = TERMS_VERSION,
) =>
  (
    await db
      .insert(users)
      .values({ name, nameKey: name, ptAdminId, termsVersion })
      .returning({ id: users.id })
  )[0].id;

const stored = async () =>
  (await db.select().from(contactAliases))
    .map((row) => `${row.ownerKey}>${row.targetKey}=${row.alias}`)
    .sort();

const asUser = (id: number) => {
  state.userId = id;
};
const asAdmin = (id: number) => {
  state.adminId = id;
};

beforeEach(async () => {
  vi.clearAllMocks();
  db = await createTestDb();
  state.db = db;
  superId = await addAdmin("root", "super_admin");
  ptA = await addAdmin("pta", "pt");
  ptB = await addAdmin("ptb", "pt");
  alice = await addUser("alice", ptA);
  bob = await addUser("bob", ptB);
  carol = await addUser("carol", ptA);
  asUser(alice);
  asAdmin(ptA);
});

describe("setContactAliasAction (trainee)", () => {
  it("stores the alias under the signed-in trainee, for the PT side, an admin or a classmate", async () => {
    for (const [targetKey, alias] of [
      ["pt", "Thầy"],
      [`admin:${superId}`, "Thầy Hoan"],
      [`user:${bob}`, "Bé Bin"],
    ]) {
      expect(await actions.setContactAliasAction({ targetKey, alias })).toEqual(
        { status: "success", targetKey, alias },
      );
    }
    expect(await stored()).toEqual(
      [
        `user:${alice}>pt=Thầy`,
        `user:${alice}>admin:${superId}=Thầy Hoan`,
        `user:${alice}>user:${bob}=Bé Bin`,
      ].sort(),
    );
  });

  it("takes the owner from the session, never from the input", async () => {
    await actions.setContactAliasAction({
      targetKey: "pt",
      alias: "Thầy",
      ownerKey: `admin:${superId}`,
    } as never);

    expect(await stored()).toEqual([`user:${alice}>pt=Thầy`]);
  });

  it("trims, collapses whitespace and replaces the previous value", async () => {
    await actions.setContactAliasAction({
      targetKey: "pt",
      alias: "  Big   Coach ",
    });
    expect(await stored()).toEqual([`user:${alice}>pt=Big Coach`]);
    await actions.setContactAliasAction({ targetKey: "pt", alias: "Coach" });
    expect(await stored()).toEqual([`user:${alice}>pt=Coach`]);
  });

  it("accepts exactly 30 characters and rejects 31", async () => {
    const ok = "ê".repeat(30);

    expect(
      await actions.setContactAliasAction({ targetKey: "pt", alias: ok }),
    ).toMatchObject({ status: "success" });
    expect(
      await actions.setContactAliasAction({
        targetKey: "pt",
        alias: `${ok}x`,
      }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.INVALID });
    expect(await stored()).toEqual([`user:${alice}>pt=${ok}`]);
  });

  it.each([
    ["a conversation key", { targetKey: "user", alias: "x" }],
    ["an unknown target", { targetKey: "everyone", alias: "x" }],
    ["an admin without id", { targetKey: "admin:", alias: "x" }],
    ["id zero", { targetKey: "user:0", alias: "x" }],
    ["control characters", { targetKey: "pt", alias: "a\u0000b" }],
    ["a non-string alias", { targetKey: "pt", alias: 5 }],
    ["no input", undefined],
    ["null input", null],
  ])("rejects bad input: %s", async (_label, input) => {
    const result = await actions.setContactAliasAction(
      input as { targetKey: string; alias: string },
    );

    expect(result.status).toBe("error");
    expect(await stored()).toEqual([]);
  });

  it("refuses to name yourself", async () => {
    expect(
      await actions.setContactAliasAction({
        targetKey: `user:${alice}`,
        alias: "Tôi",
      }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.SELF });
    expect(await stored()).toEqual([]);
  });

  it("answers 'not found' for missing, blocked or not-yet-social targets", async () => {
    const noTerms = await addUser("dan", null, null);

    await db
      .insert(socialBlocks)
      .values({ blockerId: bob, blockedId: alice, createdAt: new Date() });

    for (const targetKey of [
      "admin:9999",
      "user:9999",
      `user:${bob}`, // bob blocked alice
      `user:${noTerms}`,
    ]) {
      expect(
        await actions.setContactAliasAction({ targetKey, alias: "x" }),
      ).toEqual({ status: "error", message: ALIAS_MESSAGES.TARGET_NOT_FOUND });
    }
    expect(await stored()).toEqual([]);
  });

  it("clears with an empty alias, even for an account that is gone", async () => {
    await db.insert(contactAliases).values({
      ownerKey: `user:${alice}`,
      targetKey: "admin:9999",
      alias: "Ghost",
      updatedAt: new Date(),
    });

    expect(
      await actions.setContactAliasAction({
        targetKey: "admin:9999",
        alias: "  ",
      }),
    ).toEqual({ status: "success", targetKey: "admin:9999", alias: "" });
    expect(await stored()).toEqual([]);
  });

  it("refreshes only the owner's pages, and only for a real change", async () => {
    await actions.setContactAliasAction({ targetKey: "pt", alias: "Coach" });
    expect(revalidatePath).toHaveBeenCalledTimes(1);

    // Same value, and clearing something that is not set: nothing changes.
    await actions.setContactAliasAction({ targetKey: "pt", alias: "Coach" });
    await actions.setContactAliasAction({
      targetKey: `admin:${superId}`,
      alias: "",
    });
    expect(revalidatePath).toHaveBeenCalledTimes(1);

    await actions.setContactAliasAction({ targetKey: "pt", alias: "" });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(await stored()).toEqual([]);
  });

  it("keeps each owner's aliases apart: nobody else sees or changes them", async () => {
    await actions.setContactAliasAction({ targetKey: "pt", alias: "Thầy" });
    asUser(carol);
    await actions.setContactAliasAction({ targetKey: "pt", alias: "Cô" });

    expect(await service.loadAliases(`user:${alice}`, ["pt"])).toEqual(
      new Map([["pt", "Thầy"]]),
    );
    expect(await service.loadAliases(`user:${carol}`, ["pt"])).toEqual(
      new Map([["pt", "Cô"]]),
    );
    // The person named has no alias for the namer, and sees none of it.
    expect(await service.loadAllAliases(`admin:${superId}`)).toEqual(new Map());
  });
});

describe("adminSetContactAliasAction", () => {
  it("lets an admin name a trainee of their workspace, the super admin any", async () => {
    expect(
      await actions.adminSetContactAliasAction({
        targetKey: `user:${alice}`,
        alias: "Bé Na",
      }),
    ).toMatchObject({ status: "success", alias: "Bé Na" });
    asAdmin(superId);
    expect(
      await actions.adminSetContactAliasAction({
        targetKey: `user:${bob}`,
        alias: "Bé Bin",
      }),
    ).toMatchObject({ status: "success" });
    expect(await stored()).toEqual(
      [
        `admin:${ptA}>user:${alice}=Bé Na`,
        `admin:${superId}>user:${bob}=Bé Bin`,
      ].sort(),
    );
  });

  it("is symmetric: the admin's alias is theirs alone, the trainee still sees the real name", async () => {
    await actions.adminSetContactAliasAction({
      targetKey: `user:${alice}`,
      alias: "Bé Na",
    });

    expect(await service.loadTraineeAliases(ptA, [alice, carol])).toEqual(
      new Map([[alice, "Bé Na"]]),
    );
    // Another admin, and the trainee herself, get nothing.
    expect(await service.loadTraineeAliases(superId, [alice])).toEqual(
      new Map(),
    );
    expect(await service.loadAllAliases(`user:${alice}`)).toEqual(new Map());
  });

  it("refuses a trainee outside the admin's workspace without saying why", async () => {
    expect(
      await actions.adminSetContactAliasAction({
        targetKey: `user:${bob}`,
        alias: "Bé Bin",
      }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.TARGET_NOT_FOUND });
    expect(
      await actions.adminSetContactAliasAction({
        targetKey: "user:9999",
        alias: "Ghost",
      }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.TARGET_NOT_FOUND });
    expect(await stored()).toEqual([]);
  });

  it("treats a trainee this admin hid as missing", async () => {
    await db.insert(adminHiddenUsers).values({ adminId: ptA, userId: carol });

    expect(
      await actions.adminSetContactAliasAction({
        targetKey: `user:${carol}`,
        alias: "Bé Cúc",
      }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.TARGET_NOT_FOUND });
  });

  it("lets an admin name a colleague but never themselves, and has no PT side", async () => {
    expect(
      await actions.adminSetContactAliasAction({
        targetKey: `admin:${ptB}`,
        alias: "Đồng nghiệp",
      }),
    ).toMatchObject({ status: "success" });
    expect(
      await actions.adminSetContactAliasAction({
        targetKey: `admin:${ptA}`,
        alias: "Tôi",
      }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.SELF });
    expect(
      await actions.adminSetContactAliasAction({
        targetKey: "pt",
        alias: "PT",
      }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.TARGET_NOT_FOUND });
    expect(await stored()).toEqual([`admin:${ptA}>admin:${ptB}=Đồng nghiệp`]);
  });

  it("rejects bad input", async () => {
    for (const input of [
      { targetKey: "everyone", alias: "x" },
      { targetKey: `user:${alice}`, alias: "x".repeat(31) },
      null,
    ]) {
      expect(
        (
          await actions.adminSetContactAliasAction(
            input as { targetKey: string; alias: string },
          )
        ).status,
      ).toBe("error");
    }
    expect(await stored()).toEqual([]);
  });
});
