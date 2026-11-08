import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { rateLimits } from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { consumeRateLimit } = await import("@/services/rate-limit");

const HOUR = 60 * 60 * 1000;
const T0 = new Date("2026-11-08T08:00:00Z");
let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
});

describe("consumeRateLimit", () => {
  it("allows up to the limit and then refuses", async () => {
    const results = [];

    for (let i = 0; i < 4; i += 1) {
      results.push(await consumeRateLimit("k", 3, HOUR, T0));
    }
    expect(results.map((result) => result.allowed)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(results.map((result) => result.remaining)).toEqual([2, 1, 0, 0]);
  });

  it("starts a new window once the old one has expired", async () => {
    await consumeRateLimit("k", 1, HOUR, T0);
    expect((await consumeRateLimit("k", 1, HOUR, T0)).allowed).toBe(false);
    expect(
      (await consumeRateLimit("k", 1, HOUR, new Date(T0.getTime() + HOUR - 1)))
        .allowed,
    ).toBe(false);

    const later = new Date(T0.getTime() + HOUR);

    expect((await consumeRateLimit("k", 1, HOUR, later)).allowed).toBe(true);
    const [row] = await db.select().from(rateLimits);

    expect(row.count).toBe(1);
    expect(row.windowStartedAt.getTime()).toBe(later.getTime());
  });

  it("counts each key on its own", async () => {
    await consumeRateLimit("a", 1, HOUR, T0);

    expect((await consumeRateLimit("a", 1, HOUR, T0)).allowed).toBe(false);
    expect((await consumeRateLimit("b", 1, HOUR, T0)).allowed).toBe(true);
  });
});
