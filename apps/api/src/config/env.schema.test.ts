import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.schema.js";

const DEFAULTS = {
  PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: undefined,
};

describe("loadEnv", () => {
  it("applies the defaults", () => {
    expect(loadEnv({})).toEqual(DEFAULTS);
  });

  it("treats empty values as unset", () => {
    expect(loadEnv({ PORT: "", WEB_ORIGIN: "", DATABASE_URL: "" })).toEqual(
      DEFAULTS,
    );
  });

  it("reads PORT, WEB_ORIGIN and DATABASE_URL", () => {
    expect(
      loadEnv({
        PORT: "4100",
        WEB_ORIGIN: "https://app.example.com",
        DATABASE_URL: "postgres://pt:pw@db:5432/ptapp",
      }),
    ).toEqual({
      PORT: 4100,
      WEB_ORIGIN: "https://app.example.com",
      DATABASE_URL: "postgres://pt:pw@db:5432/ptapp",
    });
  });

  it("names every invalid variable", () => {
    expect(() =>
      loadEnv({ PORT: "abc", WEB_ORIGIN: "nope", DATABASE_URL: "mysql://x" }),
    ).toThrow(/PORT.*WEB_ORIGIN.*DATABASE_URL/);
  });
});
