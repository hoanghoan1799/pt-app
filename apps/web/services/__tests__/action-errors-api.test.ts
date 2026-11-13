import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_")) {
      throw error;
    }
  }),
}));

const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

const loadActions = async (nodeEnv: string) => {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  // Same module graph as action-errors, so `instanceof ApiError` matches.
  const { ApiError } = await import("@/services/api/errors");

  return { ...(await import("@/services/action-errors")), ApiError };
};

type Actions = Awaited<ReturnType<typeof loadActions>>;

// action-errors reads NODE_ENV at import, so each env needs its own module
// graph. Built once per env here: a cold import (next-intl and every message
// file) can take seconds on a busy machine and must not count against a
// single test's timeout.
const graphs = new Map<string, Actions>();

beforeAll(async () => {
  for (const nodeEnv of ["production", "development"]) {
    graphs.set(nodeEnv, await loadActions(nodeEnv));
    vi.unstubAllEnvs();
  }
}, 60_000);

const actionsFor = (nodeEnv: string) => {
  vi.stubEnv("NODE_ENV", nodeEnv);
  return graphs.get(nodeEnv) as Actions;
};

beforeEach(() => {
  logged.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const failWith = (error: unknown) => async () => {
  throw error;
};

describe("withResultErrorHandling and ApiError", () => {
  it("shows the API's own text and reference for a refused request, in production too", async () => {
    const { withResultErrorHandling, ApiError } = actionsFor("production");
    const run = withResultErrorHandling(
      "test",
      failWith(
        new ApiError({
          status: 409,
          code: "CONFLICT",
          message: "Email đã được dùng",
          ref: "api-ref-1",
        }),
      ),
    );

    expect(await run()).toEqual({
      status: "error",
      message: "Email đã được dùng",
      reference: "api-ref-1",
    });
  });

  it("shows only the generic text and a reference for a 5xx in production", async () => {
    const { withResultErrorHandling, ApiError } = actionsFor("production");
    const run = withResultErrorHandling(
      "test",
      failWith(
        new ApiError({
          status: 500,
          code: "INTERNAL_ERROR",
          message: "select * from users failed at db.internal:5432",
          ref: "api-ref-2",
          path: "/v1/trainees",
        }),
      ),
    );
    const result = await run();

    expect(result).toMatchObject({
      status: "error",
      message: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
    });
    expect(JSON.stringify(result)).not.toMatch(/select|db\.internal|INTERNAL/);
    expect(result).toHaveProperty(
      "reference",
      expect.stringMatching(/^[0-9a-f]{8}$/),
    );
    // The real cause (and the API's reference) go to the server log only.
    expect(JSON.stringify(logged.mock.calls)).toContain("api-ref-2");
  });

  it("hides an unreachable API and a timeout behind the same generic text", async () => {
    const { withResultErrorHandling, ApiError } = actionsFor("production");

    for (const [kind, code] of [
      ["network", "API_UNREACHABLE"],
      ["timeout", "API_TIMEOUT"],
    ] as const) {
      const result = await withResultErrorHandling(
        "test",
        failWith(
          new ApiError({ kind, status: 0, code, message: "internal host" }),
        ),
      )();

      expect(result).toMatchObject({
        message: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
      });
      expect(JSON.stringify(result)).not.toContain("internal host");
    }
  });

  it("explains the cause in development", async () => {
    const { withResultErrorHandling, ApiError } = actionsFor("development");
    const result = await withResultErrorHandling(
      "test",
      failWith(
        new ApiError({
          kind: "network",
          status: 0,
          code: "API_UNREACHABLE",
          message: "API is not reachable",
        }),
      ),
    )();

    expect(result).toMatchObject({
      status: "error",
      message: "Server không kết nối được tới API (kiểm tra API_URL)",
      reference: expect.stringContaining("API_UNREACHABLE"),
    });
  });
});
