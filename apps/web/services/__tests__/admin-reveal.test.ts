import { beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_REVEAL_COOKIE, ADMIN_UNLOCK_COOKIE } from "@/constants/session";

const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("@/services/env", () => ({
  getSessionSecret: () => "test-secret-test-secret-test-secret-1234",
}));

const lock = await import("@/services/admin-lock");
const { signSession } = await import("@/services/session-token");

beforeEach(() => {
  jar.clear();
  vi.useRealTimers();
});

describe("reveal cookie", () => {
  it("is not valid without a cookie", async () => {
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);
  });

  it("is valid for the admin it was issued to, httpOnly signed, and no one else", async () => {
    await lock.issueReveal(1);

    expect(jar.has(ADMIN_REVEAL_COOKIE)).toBe(true);
    expect(await lock.canSeeHiddenUsers(1)).toBe(true);
    expect(await lock.canSeeHiddenUsers(2)).toBe(false);
  });

  it("expires after 10 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T10:00:00Z"));
    await lock.issueReveal(1);

    vi.setSystemTime(new Date("2026-11-07T10:09:30Z"));
    expect(await lock.canSeeHiddenUsers(1)).toBe(true);

    vi.setSystemTime(new Date("2026-11-07T10:10:30Z"));
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);
  });

  it("rejects a tampered cookie and tokens of another role", async () => {
    await lock.issueReveal(1);
    jar.set(ADMIN_REVEAL_COOKIE, `${jar.get(ADMIN_REVEAL_COOKIE)}x`);
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);

    jar.set(
      ADMIN_REVEAL_COOKIE,
      await signSession({ role: "unlock", adminId: 1 }, 600),
    );
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);

    jar.set(
      ADMIN_REVEAL_COOKIE,
      await signSession({ role: "admin", adminId: 1 }, 600),
    );
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);
  });

  it("is not accepted as an unlock proof", async () => {
    await lock.issueReveal(1);
    jar.set(ADMIN_UNLOCK_COOKIE, jar.get(ADMIN_REVEAL_COOKIE) as string);

    expect(await lock.isAdminLocked({ id: 1, hasPasscode: true })).toBe(true);
  });

  it("ends when the app locks or the admin signs out (clearUnlock)", async () => {
    await lock.issueUnlock(1);
    await lock.issueReveal(1);

    await lock.clearUnlock();

    expect(jar.has(ADMIN_UNLOCK_COOKIE)).toBe(false);
    expect(jar.has(ADMIN_REVEAL_COOKIE)).toBe(false);
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);
  });

  it("clearReveal ends only the reveal", async () => {
    await lock.issueUnlock(1);
    await lock.issueReveal(1);

    await lock.clearReveal();

    expect(jar.has(ADMIN_UNLOCK_COOKIE)).toBe(true);
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);
  });
});
