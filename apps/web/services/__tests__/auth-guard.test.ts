import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeAdminMe, fakeUserMe } from "@/services/api/testing";

const state = vi.hoisted(() => ({
  // What GET /v1/auth/me answers for each cookie; null = signed out.
  admin: null as unknown,
  user: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  // No request scope in tests: run the function every time.
  cache: <T>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/services/api/me", () => ({
  fetchMe: vi.fn(async (role: string) =>
    role === "admin" ? state.admin : state.user,
  ),
}));

const guard = await import("@/services/auth-guard");

beforeEach(() => {
  state.admin = fakeAdminMe({ id: 7, username: "pt", hasPasscode: true });
  state.user = null;
});

const lockedAdmin = () =>
  fakeAdminMe({ id: 7, username: "pt", hasPasscode: true, locked: true });

describe("admin lock guards", () => {
  it("lets an admin without a passcode through", async () => {
    state.admin = fakeAdminMe({ id: 7, username: "pt", hasPasscode: false });

    expect(await guard.requireAdmin()).toMatchObject({
      id: 7,
      hasPasscode: false,
      locked: false,
    });
    expect(await guard.getApiAdmin()).toMatchObject({ id: 7 });
  });

  it("redirects a locked admin to the lock page and 401s the API", async () => {
    state.admin = lockedAdmin();

    await expect(guard.requireAdmin()).rejects.toThrow("REDIRECT:/admin/lock");
    expect(await guard.getApiAdmin()).toBeNull();
    expect(await guard.getCurrentAdmin()).toBeNull();
  });

  it("lets a locked admin use the lock-exempt guard", async () => {
    state.admin = lockedAdmin();

    expect(await guard.requireAdminSession()).toMatchObject({
      id: 7,
      locked: true,
    });
  });

  it("lets an unlocked admin with a passcode through", async () => {
    expect(await guard.requireAdmin()).toMatchObject({
      id: 7,
      hasPasscode: true,
    });
    expect(await guard.getApiAdmin()).toMatchObject({ id: 7 });
  });

  it("returns the admin shape the feature code reads", async () => {
    expect(await guard.requireAdmin()).toEqual({
      id: 7,
      username: "pt",
      role: "super_admin",
      locale: null,
      presenceHidden: false,
      hasPasscode: true,
      verified: false,
      locked: false,
      unlockedUntil: null,
      revealedUntil: null,
    });
  });

  it("ends the session without a signed-in admin", async () => {
    state.admin = null;

    await expect(guard.requireAdmin()).rejects.toThrow(
      "REDIRECT:/session/end?role=admin",
    );
    await expect(guard.requireAdminSession()).rejects.toThrow(
      "REDIRECT:/session/end?role=admin",
    );
    expect(await guard.getApiAdmin()).toBeNull();
  });

  it("does not accept a trainee token in the admin cookie", async () => {
    state.admin = fakeUserMe({ id: 7 });

    expect(await guard.getAdminSession()).toBeNull();
    await expect(guard.requireAdmin()).rejects.toThrow(
      "REDIRECT:/session/end?role=admin",
    );
  });
});

describe("user guards", () => {
  it("returns the trainee the API reports, with no database row behind it", async () => {
    state.user = fakeUserMe({
      id: 4,
      name: "An",
      email: "an@e2e.test",
      chatEnabled: true,
      termsVersion: 2,
      preferredMealCount: 4,
      foodNote: "no peanuts",
    });

    expect(await guard.requireUser()).toEqual({
      id: 4,
      name: "An",
      email: "an@e2e.test",
      locale: null,
      ptAdminId: null,
      chatEnabled: true,
      termsVersion: 2,
      preferredMealCount: 4,
      foodNote: "no peanuts",
    });
  });

  it("gives a new trainee a locked chat and no terms", async () => {
    state.user = fakeUserMe({ id: 4 });

    expect(await guard.requireUser()).toMatchObject({
      id: 4,
      chatEnabled: false,
      termsVersion: null,
    });
  });

  it("ends the session without a signed-in trainee", async () => {
    await expect(guard.requireUser()).rejects.toThrow(
      "REDIRECT:/session/end?role=user",
    );
    expect(await guard.getApiUser()).toBeNull();
  });

  it("does not accept an admin token in the trainee cookie", async () => {
    state.user = fakeAdminMe({ id: 1 });

    expect(await guard.getCurrentUser()).toBeNull();
  });
});

describe("requireSuperAdmin", () => {
  it("sends a PT back to the dashboard", async () => {
    state.admin = fakeAdminMe({ id: 7, role: "pt" });

    await expect(guard.requireSuperAdmin()).rejects.toThrow("REDIRECT:/admin");
  });
});
