import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";

import { GET } from "../route";

const fetchMock = vi.fn();

const end = (query: string, cookies: Record<string, string>) =>
  GET(
    new NextRequest(`http://localhost:3000/session/end${query}`, {
      headers: {
        cookie: Object.entries(cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      },
    }),
  );

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_URL", "http://api.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sentRequest = () => {
  const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];

  return {
    url: String(input),
    method: init.method,
    authorization: new Headers(init.headers).get("authorization"),
  };
};

describe("GET /session/end", () => {
  it("revokes the trainee token on the API, clears the cookie and goes home", async () => {
    const response = await end("", { [USER_COOKIE]: "trainee-token" });

    expect(sentRequest()).toEqual({
      url: "http://api.test/v1/auth/logout",
      method: "POST",
      authorization: "Bearer trainee-token",
    });
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
    expect(response.headers.get("set-cookie")).toContain(`${USER_COOKIE}=;`);
  });

  it("revokes the admin token and goes to the admin login", async () => {
    const response = await end("?role=admin", {
      [ADMIN_COOKIE]: "admin-token",
      [USER_COOKIE]: "trainee-token",
    });

    expect(sentRequest().authorization).toBe("Bearer admin-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/admin/login",
    );
    expect(response.headers.get("set-cookie")).toContain(`${ADMIN_COOKIE}=;`);
  });

  it("still clears the cookie when the API is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const response = await end("", { [USER_COOKIE]: "trainee-token" });

    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toContain(`${USER_COOKIE}=;`);
  });

  it("does not call the API without a cookie", async () => {
    const response = await end("", {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
  });
});
