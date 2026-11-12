import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdminMe, fakeUserMe } from "@/services/api/testing";

const state = vi.hoisted(() => ({ me: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/services/api/me", () => ({
  fetchMe: vi.fn(async () => state.me),
}));
vi.mock("@/services/api/call", () => ({ callApi: vi.fn() }));

const lock = await import("@/services/admin-lock");

const inFuture = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toISOString();

beforeEach(() => {
  state.me = fakeAdminMe({ id: 1, hasPasscode: true });
});

// The reveal window and the lock now live on the API session (/auth/me);
// opening, timing and ending them is tested in apps/api/test/passcode.e2e.test.ts.
describe("canSeeHiddenUsers", () => {
  it("is false without a reveal", async () => {
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);
  });

  it("is true inside the reveal window, for this admin only", async () => {
    state.me = fakeAdminMe({ id: 1, revealedUntil: inFuture(60) });

    expect(await lock.canSeeHiddenUsers(1)).toBe(true);
    expect(await lock.canSeeHiddenUsers(2)).toBe(false);
  });

  it("is false once the window has passed", async () => {
    state.me = fakeAdminMe({ id: 1, revealedUntil: inFuture(-1) });

    expect(await lock.canSeeHiddenUsers(1)).toBe(false);
  });

  it("is false when nobody is signed in or the token is a trainee's", async () => {
    state.me = null;
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);

    state.me = fakeUserMe({ id: 1 });
    expect(await lock.canSeeHiddenUsers(1)).toBe(false);
  });
});

describe("isAdminLocked", () => {
  it("follows the lock state the API reports", () => {
    expect(lock.isAdminLocked({ locked: true })).toBe(true);
    expect(lock.isAdminLocked({ locked: false })).toBe(false);
  });
});
