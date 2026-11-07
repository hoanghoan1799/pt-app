import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { adminHiddenUsers, admins, loginAttempts } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  adminId: 0,
  unlocked: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));
vi.mock("@/services/admin-lock", () => ({
  issueUnlock: vi.fn(async () => undefined),
  clearUnlock: vi.fn(async () => undefined),
  clearReveal: vi.fn(async () => undefined),
}));
vi.mock("@/services/session", () => ({
  endSession: vi.fn(async () => undefined),
}));
vi.mock("@/services/auth-guard", async () => {
  const { findAdminById } = await import("@/services/admins");

  return {
    requireAdminSession: vi.fn(
      async () => (await findAdminById(state.adminId))!,
    ),
    requireAdmin: vi.fn(async () => {
      if (!state.unlocked) {
        throw new Error("REDIRECT:/admin/lock");
      }
      return (await findAdminById(state.adminId))!;
    }),
  };
});

const { clearUnlock, issueUnlock } = await import("@/services/admin-lock");
const { endSession } = await import("@/services/session");
const { hashPassword } = await import("@/services/password");
const actions = await import("@/features/auth/services/passcode-actions");

let db: TestDb;

const load = async () =>
  (await db.select().from(admins).where(eq(admins.id, state.adminId)))[0];

const withPasscode = async (code: string) => {
  await db
    .update(admins)
    .set({ passcodeHash: await hashPassword(code) })
    .where(eq(admins.id, state.adminId));
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.unlocked = true;
  vi.mocked(issueUnlock).mockClear();
  vi.mocked(clearUnlock).mockClear();
  vi.mocked(endSession).mockClear();
  const [row] = await db
    .insert(admins)
    .values({
      username: "pt",
      usernameKey: "pt",
      passwordHash: await hashPassword("correct-password"),
    })
    .returning({ id: admins.id });

  state.adminId = row.id;
});

describe("setPasscode", () => {
  it("stores a hash (not the code) and unlocks right away", async () => {
    expect(await actions.setPasscode("1234")).toEqual({ status: "success" });

    const admin = await load();

    expect(admin.passcodeHash).toMatch(/^scrypt\$/);
    expect(admin.passcodeHash).not.toContain("1234");
    expect(issueUnlock).toHaveBeenCalledWith(state.adminId);
  });

  it("rejects anything but 4 digits", async () => {
    for (const bad of ["123", "12345", "abcd", ""]) {
      expect(await actions.setPasscode(bad)).toMatchObject({
        status: "error",
        message: "Mã khoá gồm đúng 4 chữ số",
      });
    }
    expect((await load()).passcodeHash).toBeNull();
  });

  it("refuses when a passcode already exists", async () => {
    await withPasscode("1111");
    const before = (await load()).passcodeHash;

    expect(await actions.setPasscode("2222")).toMatchObject({
      status: "error",
    });
    expect((await load()).passcodeHash).toBe(before);
  });

  it("needs an unlocked session", async () => {
    state.unlocked = false;

    expect(await actions.setPasscode("1234")).toMatchObject({
      status: "error",
    });
    expect((await load()).passcodeHash).toBeNull();
  });
});

describe("verifyPasscode", () => {
  beforeEach(async () => {
    await withPasscode("1234");
    state.unlocked = false;
  });

  it("unlocks on the right code and resets the counter", async () => {
    await actions.verifyPasscode("0000");
    await actions.verifyPasscode("0000");
    expect((await load()).passcodeFailedCount).toBe(2);
    expect(issueUnlock).not.toHaveBeenCalled();

    expect(await actions.verifyPasscode("1234")).toEqual({
      status: "success",
    });
    expect((await load()).passcodeFailedCount).toBe(0);
    expect(issueUnlock).toHaveBeenCalledWith(state.adminId);
  });

  it("counts wrong codes down and signs out on the 5th", async () => {
    for (const left of [4, 3, 2, 1]) {
      expect(await actions.verifyPasscode("0000")).toMatchObject({
        status: "error",
        attemptsLeft: left,
      });
    }
    expect(endSession).not.toHaveBeenCalled();

    const last = await actions.verifyPasscode("0000");

    expect(last).toMatchObject({ status: "error", signedOut: true });
    expect(endSession).toHaveBeenCalledWith("pt_admin");
    expect(clearUnlock).toHaveBeenCalled();
    expect((await load()).passcodeFailedCount).toBe(0);
    expect(issueUnlock).not.toHaveBeenCalled();
  });

  it("does not unlock on a malformed code or a missing passcode", async () => {
    expect(await actions.verifyPasscode("12")).toMatchObject({
      status: "error",
    });
    await db
      .update(admins)
      .set({ passcodeHash: null })
      .where(eq(admins.id, state.adminId));
    expect(await actions.verifyPasscode("1234")).toMatchObject({
      status: "error",
    });
    expect(issueUnlock).not.toHaveBeenCalled();
  });
});

describe("changePasscode", () => {
  beforeEach(async () => withPasscode("1234"));

  it("replaces the passcode when the current one is right", async () => {
    const before = (await load()).passcodeHash;

    expect(await actions.changePasscode("1234", "4321")).toEqual({
      status: "success",
    });
    expect((await load()).passcodeHash).not.toBe(before);
    expect(await actions.verifyPasscode("4321")).toEqual({ status: "success" });
  });

  it("keeps the old passcode on a wrong current code and counts it", async () => {
    const before = (await load()).passcodeHash;

    expect(await actions.changePasscode("0000", "4321")).toMatchObject({
      status: "error",
      attemptsLeft: 4,
    });
    expect((await load()).passcodeHash).toBe(before);
  });

  it("rejects an unchanged or malformed new code", async () => {
    expect(await actions.changePasscode("1234", "1234")).toMatchObject({
      status: "error",
    });
    expect(await actions.changePasscode("1234", "43")).toMatchObject({
      status: "error",
    });
  });
});

describe("turnOffPasscode", () => {
  beforeEach(async () => withPasscode("1234"));

  it("clears the hash and the unlock with the right code", async () => {
    expect(await actions.turnOffPasscode("1234")).toEqual({
      status: "success",
    });
    expect((await load()).passcodeHash).toBeNull();
    expect(clearUnlock).toHaveBeenCalled();
  });

  it("refuses with a wrong code", async () => {
    expect(await actions.turnOffPasscode("0000")).toMatchObject({
      status: "error",
    });
    expect((await load()).passcodeHash).not.toBeNull();
  });

  it("refuses while this admin has hidden chats, not for another admin's", async () => {
    const [other] = await db
      .insert(admins)
      .values({ username: "b", usernameKey: "b", passwordHash: "x" })
      .returning({ id: admins.id });

    await db.insert(adminHiddenUsers).values({ adminId: other.id, userId: 1 });
    expect(await actions.turnOffPasscode("1234")).toEqual({
      status: "success",
    });

    await withPasscode("1234");
    await db
      .insert(adminHiddenUsers)
      .values({ adminId: state.adminId, userId: 2 });

    expect(await actions.turnOffPasscode("1234")).toEqual({
      status: "error",
      message: "Hãy bỏ ẩn các học viên đã ẩn trước khi tắt mã khoá",
    });
    expect((await load()).passcodeHash).not.toBeNull();
  });
});

describe("resetPasscodeWithPassword", () => {
  beforeEach(async () => {
    await withPasscode("1234");
    state.unlocked = false;
  });

  it("sets a new passcode and unlocks with the account password", async () => {
    expect(
      await actions.resetPasscodeWithPassword("correct-password", "9999"),
    ).toEqual({ status: "success" });
    expect(issueUnlock).toHaveBeenCalledWith(state.adminId);
    expect(await actions.verifyPasscode("9999")).toEqual({ status: "success" });
  });

  it("rejects a wrong password and locks out after repeated failures", async () => {
    for (let i = 0; i < 5; i++) {
      expect(
        await actions.resetPasscodeWithPassword("nope", "9999"),
      ).toMatchObject({ status: "error", message: "Mật khẩu không đúng" });
    }
    expect((await db.select().from(loginAttempts))[0]?.key).toBe(
      `passcode-reset:${state.adminId}`,
    );

    // Even the right password is refused while the limiter holds.
    expect(
      await actions.resetPasscodeWithPassword("correct-password", "9999"),
    ).toMatchObject({ status: "error" });
    expect(issueUnlock).not.toHaveBeenCalled();
    expect(await actions.verifyPasscode("1234")).toEqual({ status: "success" });
  });

  it("rejects a malformed new passcode", async () => {
    expect(
      await actions.resetPasscodeWithPassword("correct-password", "12"),
    ).toMatchObject({ status: "error" });
    expect(issueUnlock).not.toHaveBeenCalled();
  });
});
