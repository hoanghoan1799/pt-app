import { describe, expect, it } from "vitest";

import { assertLocalDatabase } from "./demo-guard.js";

describe("assertLocalDatabase", () => {
  it("accepts localhost databases", () => {
    expect(() =>
      assertLocalDatabase(
        "postgres://pt:pw@localhost:5432/ptapp",
        "development",
      ),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabase("postgres://pt:pw@127.0.0.1:5432/ptapp", undefined),
    ).not.toThrow();
  });

  it("refuses production, remote hosts, a missing or invalid URL", () => {
    const local = "postgres://pt:pw@localhost:5432/ptapp";

    expect(() => assertLocalDatabase(local, "production")).toThrow(
      /NODE_ENV=production/,
    );
    expect(() =>
      assertLocalDatabase(
        "postgres://pt:pw@db.example.com:5432/x",
        "development",
      ),
    ).toThrow(/localhost/);
    expect(() => assertLocalDatabase(undefined, "development")).toThrow(
      /DATABASE_URL/,
    );
    expect(() => assertLocalDatabase("not a url", "development")).toThrow(
      /valid URL/,
    );
  });
});
