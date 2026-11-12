import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.schema.js";

const DATABASE_URL = "postgres://pt:pw@db:5432/ptapp";

const DEFAULTS = {
  NODE_ENV: "production",
  PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL,
  LOGIN_THROTTLE_LIMIT: 20,
  REALTIME_RECHECK_SECONDS: 300,
  LOG_LEVEL: undefined,
};

describe("loadEnv", () => {
  it("applies the defaults", () => {
    expect(loadEnv({ DATABASE_URL })).toEqual(DEFAULTS);
  });

  it("treats empty optional values as unset", () => {
    expect(
      loadEnv({
        DATABASE_URL,
        NODE_ENV: "",
        PORT: "",
        WEB_ORIGIN: "",
        LOGIN_THROTTLE_LIMIT: "",
        VAPID_PUBLIC_KEY: "",
        VAPID_PRIVATE_KEY: "",
        VAPID_SUBJECT: "",
        REALTIME_RECHECK_SECONDS: "",
        LOG_LEVEL: "",
      }),
    ).toEqual(DEFAULTS);
  });

  it("reads every variable", () => {
    expect(
      loadEnv({
        NODE_ENV: "production",
        PORT: "4100",
        WEB_ORIGIN: "https://app.example.com",
        DATABASE_URL: "postgresql://pt:pw@db:5432/ptapp",
        LOGIN_THROTTLE_LIMIT: "50",
        VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
        VAPID_SUBJECT: "mailto:coach@example.com",
        REALTIME_RECHECK_SECONDS: "60",
        LOG_LEVEL: "debug",
      }),
    ).toEqual({
      NODE_ENV: "production",
      PORT: 4100,
      WEB_ORIGIN: "https://app.example.com",
      DATABASE_URL: "postgresql://pt:pw@db:5432/ptapp",
      LOGIN_THROTTLE_LIMIT: 50,
      VAPID_PUBLIC_KEY: "pub",
      VAPID_PRIVATE_KEY: "priv",
      VAPID_SUBJECT: "mailto:coach@example.com",
      REALTIME_RECHECK_SECONDS: 60,
      LOG_LEVEL: "debug",
    });
  });

  it("requires DATABASE_URL and says so by name", () => {
    expect(() => loadEnv({})).toThrow(/missing: DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: "" })).toThrow(
      /missing: DATABASE_URL/,
    );
  });

  it("names every invalid variable", () => {
    let message = "";

    try {
      loadEnv({
        PORT: "abc",
        WEB_ORIGIN: "nope",
        DATABASE_URL: "mysql://x",
        NODE_ENV: "staging",
        LOGIN_THROTTLE_LIMIT: "0",
        LOG_LEVEL: "loud",
      });
    } catch (error) {
      message = (error as Error).message;
    }

    for (const name of [
      "PORT",
      "WEB_ORIGIN",
      "DATABASE_URL",
      "NODE_ENV",
      "LOGIN_THROTTLE_LIMIT",
      "LOG_LEVEL",
    ]) {
      expect(message).toContain(name);
    }
  });

  it("never prints a value, not even in an invalid DATABASE_URL", () => {
    let message = "";

    try {
      loadEnv({
        DATABASE_URL: "mysql://admin:hunter2@db/ptapp",
        PORT: "99999",
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("99999");
  });
});
