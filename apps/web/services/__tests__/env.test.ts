import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getApiUrl,
  getDatabaseConfig,
  getSessionSecret,
  getSuperAdminCredentials,
} from "@/services/env";
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

describe("getSuperAdminCredentials", () => {
  const clear = () => {
    for (const name of [
      "SUPER_ADMIN_USERNAME",
      "SUPER_ADMIN_PASSWORD",
      "ADMIN_USERNAME",
      "ADMIN_PASSWORD",
    ]) {
      vi.stubEnv(name, "");
    }
  };

  it("reads SUPER_ADMIN_* when set", () => {
    clear();
    vi.stubEnv("SUPER_ADMIN_USERNAME", " boss ");
    vi.stubEnv("SUPER_ADMIN_PASSWORD", "super-secret-1");
    vi.stubEnv("ADMIN_USERNAME", "old");
    vi.stubEnv("ADMIN_PASSWORD", "old-password");

    expect(getSuperAdminCredentials()).toEqual({
      username: "boss",
      password: "super-secret-1",
    });
  });

  it("falls back to the old ADMIN_* names when the new ones are missing", () => {
    clear();
    vi.stubEnv("ADMIN_USERNAME", "old");
    vi.stubEnv("ADMIN_PASSWORD", "old-password");

    expect(getSuperAdminCredentials()).toEqual({
      username: "old",
      password: "old-password",
    });
  });

  it("returns empty strings when nothing is set", () => {
    clear();

    expect(getSuperAdminCredentials()).toEqual({ username: "", password: "" });
  });
});

describe("getApiUrl", () => {
  it("defaults to the local API outside production", () => {
    vi.stubEnv("API_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getApiUrl()).toBe("http://localhost:4000");
  });

  it("is required in production and on Vercel", () => {
    vi.stubEnv("API_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(catchError(getApiUrl).code).toBe("CONFIG_MISSING");

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    expect(catchError(getApiUrl).code).toBe("CONFIG_MISSING");
  });

  it("drops a trailing slash and keeps a path prefix", () => {
    vi.stubEnv("API_URL", "https://api.example.com/");
    expect(getApiUrl()).toBe("https://api.example.com");

    vi.stubEnv("API_URL", "https://example.com/api/");
    expect(getApiUrl()).toBe("https://example.com/api");
  });

  it("rejects a value that is not an http(s) URL", () => {
    vi.stubEnv("API_URL", "not a url");
    expect(catchError(getApiUrl).code).toBe("CONFIG_INVALID");

    vi.stubEnv("API_URL", "ftp://api.example.com");
    expect(catchError(getApiUrl).code).toBe("CONFIG_INVALID");
  });
});
