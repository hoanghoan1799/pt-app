import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb } from "@/db/__tests__/create-test-db";
import { pushSubscriptions } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number },
  admin: null as null | { id: number },
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: vi.fn() } }));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const route = await import("@/app/api/push/subscribe/route");

const subscription = {
  endpoint: "https://push.example/abc",
  keys: { p256dh: "p", auth: "a" },
};

const call = (
  method: "POST" | "DELETE",
  body: unknown,
  query = "",
): Promise<Response> =>
  route[method](
    new NextRequest(`http://localhost/api/push/subscribe${query}`, {
      method,
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "user-agent": "TestAgent" },
    }),
  );

const rows = async () =>
  (state.db as Awaited<ReturnType<typeof createTestDb>>)
    .select()
    .from(pushSubscriptions);

beforeEach(async () => {
  state.db = await createTestDb();
  state.user = { id: 4 };
  state.admin = null;
});

describe("/api/push/subscribe", () => {
  it("401 when nobody is signed in", async () => {
    state.user = null;

    expect((await call("POST", subscription)).status).toBe(401);
    expect((await call("DELETE", { endpoint: "x" })).status).toBe(401);
  });

  it("401 for ?as=admin with only a trainee session", async () => {
    expect((await call("POST", subscription, "?as=admin")).status).toBe(401);
  });

  it("400 on a bad body", async () => {
    expect((await call("POST", { endpoint: "http://x" })).status).toBe(400);
    expect((await call("POST", "not json")).status).toBe(400);
    expect((await call("DELETE", {})).status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it("204 stores the subscription for the trainee, then deletes it", async () => {
    expect((await call("POST", subscription)).status).toBe(204);
    expect(await rows()).toMatchObject([
      {
        ownerKey: "user:4",
        endpoint: subscription.endpoint,
        userAgent: "TestAgent",
      },
    ]);

    expect(
      (await call("DELETE", { endpoint: subscription.endpoint })).status,
    ).toBe(204);
    expect(await rows()).toHaveLength(0);
  });

  it("stores under the admin owner with ?as=admin", async () => {
    state.admin = { id: 2 };

    expect((await call("POST", subscription, "?as=admin")).status).toBe(204);
    expect((await rows())[0].ownerKey).toBe("admin:2");
  });
});
