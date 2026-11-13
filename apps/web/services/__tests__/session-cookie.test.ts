import { afterEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import {
  cookieNameFor,
  getSessionCookieOptions,
  maxAgeFor,
  sessionCookieFor,
} from "@/services/session-cookie";

afterEach(() => {
  vi.unstubAllEnvs();
});

const DAY = 60 * 60 * 24;

describe("session cookie", () => {
  it("keeps the cookie names users and admins already have", () => {
    expect(cookieNameFor("user")).toBe(USER_COOKIE);
    expect(cookieNameFor("admin")).toBe(ADMIN_COOKIE);
    expect([USER_COOKIE, ADMIN_COOKIE]).toEqual(["pt_user", "pt_admin"]);
  });

  it("lasts as long as the API session: trainee 400 days, admin 7 days", () => {
    expect(maxAgeFor("user")).toBe(400 * DAY);
    expect(maxAgeFor("admin")).toBe(7 * DAY);
  });

  it("is httpOnly, Lax, site-wide, and Secure only in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSessionCookieOptions(10)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 10,
    });

    vi.stubEnv("NODE_ENV", "production");
    expect(getSessionCookieOptions(10).secure).toBe(true);
  });

  it("carries the opaque token as the cookie value", () => {
    expect(sessionCookieFor("admin", "tok")).toEqual({
      name: "pt_admin",
      value: "tok",
      options: getSessionCookieOptions(7 * DAY),
    });
  });
});
