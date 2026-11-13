import { afterEach, describe, expect, it, vi } from "vitest";

import { getApiUrl } from "@/services/env";
import { AppError } from "@/utils/errors";

const catchError = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error as AppError;
  }
  throw new Error("Expected an error");
};

afterEach(() => {
  vi.unstubAllEnvs();
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
