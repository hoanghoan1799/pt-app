import type { MeResponse } from "@pt/contracts";

// Builders for unit tests that fake GET /v1/auth/me (the auth guard's source).
// Use with:
//   vi.mock("@/services/api/me", () => ({ fetchMe: vi.fn(async (role) => ...) }));

const SESSION = {
  id: "00000000-0000-4000-8000-000000000001",
  clientKind: "web" as const,
  clientName: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  current: true,
};

export const fakeAdminMe = (
  overrides: Partial<Extract<MeResponse["actor"], { kind: "admin" }>> = {},
): MeResponse => ({
  role: overrides.role ?? "super_admin",
  actor: {
    kind: "admin",
    id: 1,
    username: "e2e-admin",
    role: "super_admin",
    verified: false,
    locale: null,
    presenceHidden: false,
    hasPasscode: false,
    locked: false,
    unlockedUntil: null,
    revealedUntil: null,
    ...overrides,
  },
  session: SESSION,
});

export const fakeUserMe = (
  overrides: Partial<Extract<MeResponse["actor"], { kind: "user" }>> = {},
): MeResponse => ({
  role: "trainee",
  actor: {
    kind: "user",
    id: 1,
    name: "Trainee",
    email: "trainee@e2e.test",
    locale: null,
    ptAdminId: null,
    ...overrides,
  },
  session: SESSION,
});
