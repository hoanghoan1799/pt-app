import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as unknown,
  admin: null as null | { id: number; username: string; hasPasscode: boolean },
  proof: null as null | { adminId: number; expiresAt: number },
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
vi.mock("@/services/session", () => ({
  readSession: vi.fn(async () => state.session),
}));
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async () => state.admin),
}));
vi.mock("@/services/users", () => ({ findUserById: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock("@/services/session-token", () => ({
  getSessionCookieOptions: vi.fn(),
  signSession: vi.fn(),
  verifySession: vi.fn(async () =>
    state.proof ? { role: "unlock", ...state.proof } : null,
  ),
}));

const guard = await import("@/services/auth-guard");

const admin = (hasPasscode: boolean) => ({
  id: 7,
  username: "pt",
  hasPasscode,
});

beforeEach(() => {
  state.session = { role: "admin", adminId: 7 };
  state.admin = admin(true);
  state.proof = null;
});

describe("admin lock guards", () => {
  it("lets an admin without a passcode through", async () => {
    state.admin = admin(false);

    expect(await guard.requireAdmin()).toEqual(admin(false));
    expect(await guard.getApiAdmin()).toEqual(admin(false));
  });

  it("redirects a locked admin to the lock page and 401s the API", async () => {
    await expect(guard.requireAdmin()).rejects.toThrow("REDIRECT:/admin/lock");
    expect(await guard.getApiAdmin()).toBeNull();
    expect(await guard.getCurrentAdmin()).toBeNull();
  });

  it("lets a locked admin use the lock-exempt guard", async () => {
    expect(await guard.requireAdminSession()).toEqual(admin(true));
  });

  it("lets an admin with a valid unlock through", async () => {
    state.proof = { adminId: 7, expiresAt: Date.now() / 1000 + 60 };

    expect(await guard.requireAdmin()).toEqual(admin(true));
    expect(await guard.getApiAdmin()).toEqual(admin(true));
  });

  it("keeps locking on an expired or foreign unlock", async () => {
    state.proof = { adminId: 7, expiresAt: Date.now() / 1000 - 1 };
    await expect(guard.requireAdmin()).rejects.toThrow("REDIRECT:/admin/lock");

    state.proof = { adminId: 8, expiresAt: Date.now() / 1000 + 60 };
    expect(await guard.getApiAdmin()).toBeNull();
  });

  it("ends the session without a signed-in admin", async () => {
    state.session = null;

    await expect(guard.requireAdmin()).rejects.toThrow(
      "REDIRECT:/session/end?role=admin",
    );
    await expect(guard.requireAdminSession()).rejects.toThrow(
      "REDIRECT:/session/end?role=admin",
    );
    expect(await guard.getApiAdmin()).toBeNull();
  });
});
