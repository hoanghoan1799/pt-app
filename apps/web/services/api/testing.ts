import type { MeResponse } from "@pt/contracts";

import { ApiError } from "@/services/api/errors";

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
    chatEnabled: false,
    termsVersion: null,
    preferredMealCount: null,
    foodNote: null,
    ...overrides,
  },
  session: SESSION,
});

// ---- Fake API calls for action tests ----
//
//   const fake = vi.hoisted(() => ({ api: null as FakeApi | null }));
//   vi.mock("@/services/api/call", async () => {
//     const { createFakeApi } = await import("@/services/api/testing");
//
//     fake.api = createFakeApi();
//     return { callApi: fake.api.callApi, tryApi: fake.api.tryApi };
//   });
//   fake.api.respond = ({ method, path }) => ({ id: 1 });
//
// `respond` gets the actor, the HTTP method, the OpenAPI path template and the
// init (params/body/query) the action passed, and returns the response data.
// Throw `apiRefusal(status, code, message)` for a refused request: `tryApi`
// returns it as `{ ok: false }`, `callApi` throws it.

export type FakeApiRequest = {
  actor: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  init: {
    params?: {
      path?: Record<string, unknown>;
      query?: Record<string, unknown>;
    };
    body?: unknown;
  };
};

export const apiRefusal = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message, ref: "ref-test" });

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export const createFakeApi = () => {
  const fake = {
    calls: [] as FakeApiRequest[],
    respond: (() => undefined) as (
      request: FakeApiRequest,
    ) => unknown | Promise<unknown>,
    callApi: async (
      actor: string,
      call: (api: unknown) => Promise<{ data?: unknown }>,
    ) => {
      const api = Object.fromEntries(
        METHODS.map((method) => [
          method,
          async (path: string, init: FakeApiRequest["init"] = {}) => {
            const request = { actor, method, path, init };

            fake.calls.push(request);
            return { data: await fake.respond(request) };
          },
        ]),
      );

      return (await call(api)).data;
    },
    tryApi: async (
      actor: string,
      call: (api: unknown) => Promise<{ data?: unknown }>,
    ) => {
      try {
        return { ok: true as const, data: await fake.callApi(actor, call) };
      } catch (error) {
        if (error instanceof ApiError && error.isClientError) {
          return { ok: false as const, error };
        }
        throw error;
      }
    },
    reset: () => {
      fake.calls = [];
      fake.respond = () => undefined;
    },
  };

  return fake;
};

export type FakeApi = ReturnType<typeof createFakeApi>;
