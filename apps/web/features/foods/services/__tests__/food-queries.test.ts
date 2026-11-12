import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/fake-call";

// Search and ordering are the API's (apps/api/test/foods.e2e.test.ts and
// foods.search.test.ts). These cover how the web reads the cursor pages.

vi.mock("server-only", () => ({}));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/fake-call");
  const fake = createFakeApi();

  return { callApi: fake.callApi, tryApi: fake.tryApi, fake };
});

const { getFood, listFoods } =
  await import("@/features/foods/services/food-queries");
const { fake } = (await import("@/services/api/call")) as unknown as {
  fake: FakeApi;
};

const food = (id: number) => ({ id, name: `Món ${id}` });

beforeEach(() => fake.reset());

describe("listFoods", () => {
  it("follows nextCursor until the last page, 200 foods at a time", async () => {
    fake.reply(
      { items: [food(1), food(2)], nextCursor: "c1" },
      { items: [food(3)], nextCursor: "c2" },
      { items: [food(4)], nextCursor: null },
    );

    const foods = await listFoods("user");

    expect(foods.map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(fake.requests.map((request) => request.params?.query)).toEqual([
      { limit: 200, cursor: undefined },
      { limit: 200, cursor: "c1" },
      { limit: 200, cursor: "c2" },
    ]);
    expect(fake.requests.every((request) => request.actor === "user")).toBe(
      true,
    );
  });

  it("reads as the admin on the admin screens", async () => {
    fake.reply({ items: [], nextCursor: null });

    expect(await listFoods("admin")).toEqual([]);
    expect(fake.requests[0].actor).toBe("admin");
  });
});

describe("getFood", () => {
  it("returns the food", async () => {
    fake.reply(food(5));

    expect(await getFood("user", 5)).toEqual(food(5));
    expect(fake.requests[0].params).toEqual({ path: { id: "5" } });
  });

  it("is null for a bad id without calling the API", async () => {
    expect(await getFood("user", Number.NaN)).toBeNull();
    expect(await getFood("user", 0)).toBeNull();
    expect(fake.requests).toHaveLength(0);
  });

  it("is null for a missing or archived food and rethrows other refusals", async () => {
    fake.refuse(404, "FOOD_NOT_FOUND", "Món này không còn tồn tại");
    expect(await getFood("user", 5)).toBeNull();

    fake.refuse(403, "FORBIDDEN", "Không có quyền");
    await expect(getFood("user", 5)).rejects.toMatchObject({ status: 403 });
  });
});
