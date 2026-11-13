import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/api/errors";

// The health report is the API's now: this app has no database of its own to
// check. The API's own answer (ok / 503 with the database down) is covered by
// apps/api/test/health.e2e.test.ts.

const state = vi.hoisted(() => ({
  outcome: null as unknown,
  apiUrl: "http://localhost:4000" as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/api/call", () => ({
  runApi: vi.fn(async () => state.outcome),
}));
vi.mock("@/services/env", () => ({
  getApiUrl: vi.fn(() => {
    if (!state.apiUrl) {
      throw new Error("API_URL missing");
    }
    return state.apiUrl;
  }),
}));

const { canViewHealthDetails, checkHealth } = await import("@/services/health");

beforeEach(() => {
  state.apiUrl = "http://localhost:4000";
  state.outcome = { ok: true, data: { status: "ok", db: "ok" } };
});

describe("checkHealth", () => {
  it("is ok when the API answers and its database is up", async () => {
    const report = await checkHealth();

    expect(report.status).toBe("ok");
    expect(report.checks.api).toMatchObject({ status: "ok" });
  });

  it("reports the API as unreachable when the call fails", async () => {
    state.outcome = {
      ok: false,
      error: new ApiError({
        status: 0,
        code: "NETWORK",
        message: "fetch failed",
        kind: "network",
      }),
    };
    const report = await checkHealth();

    expect(report.status).toBe("error");
    expect(report.checks.api).toMatchObject({
      status: "error",
      code: "API_UNREACHABLE",
    });
  });

  it("skips the API call when API_URL is missing", async () => {
    state.apiUrl = null;
    const report = await checkHealth();

    expect(report.status).toBe("error");
    expect(report.checks.api).toMatchObject({ status: "skipped" });
  });
});

describe("canViewHealthDetails", () => {
  it("allows everyone outside production", () => {
    expect(canViewHealthDetails(null)).toBe(true);
  });
});
