import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabaseConfig, getSessionSecret } from "@/services/env";
import { AppError } from "@/utils/errors";

const catchError = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error as AppError;
  }
  throw new Error("Expected an error");
};

const clearDatabaseEnv = () => {
  for (const name of [
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "DATABASE_URL",
    "DATABASE_AUTH_TOKEN",
  ]) {
    vi.stubEnv(name, "");
  }
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDatabaseConfig", () => {
  beforeEach(clearDatabaseEnv);

  it("falls back to the local SQLite file outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "");

    expect(getDatabaseConfig().url).toBe("file:local.db");
  });

  it("requires DATABASE_URL on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "");

    expect(catchError(getDatabaseConfig).code).toBe("CONFIG_MISSING");
  });

  it("rejects a SQLite file on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "file:local.db");

    expect(catchError(getDatabaseConfig).code).toBe("DB_FILE_UNAVAILABLE");
  });

  it("prefers the Vercel Turso integration variables", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "file:local.db");
    vi.stubEnv(
      "TURSO_DATABASE_URL",
      "libsql://database-coquelicot-basket.turso.io",
    );
    vi.stubEnv("TURSO_AUTH_TOKEN", "turso-token");

    expect(getDatabaseConfig()).toEqual({
      url: "libsql://database-coquelicot-basket.turso.io",
      authToken: "turso-token",
    });
  });

  it("requires an auth token for Turso on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "libsql://pt-app.turso.io");

    expect(catchError(getDatabaseConfig).code).toBe("CONFIG_MISSING");
  });

  it("passes a Turso URL and token through", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "libsql://pt-app.turso.io");
    vi.stubEnv("DATABASE_AUTH_TOKEN", "token");

    expect(getDatabaseConfig()).toEqual({
      url: "libsql://pt-app.turso.io",
      authToken: "token",
    });
  });
});

describe("getSessionSecret", () => {
  it("reports a missing or short secret", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(catchError(getSessionSecret).code).toBe("CONFIG_MISSING");

    vi.stubEnv("SESSION_SECRET", "short");
    expect(catchError(getSessionSecret).code).toBe("CONFIG_INVALID");
  });
});
