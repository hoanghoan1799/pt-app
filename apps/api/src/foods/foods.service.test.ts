import { foodRequestSchema } from "@pt/contracts";
import { QueryFailedError } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import type { AuthActor } from "../auth/actor.js";
import { RoleForbiddenError } from "../auth/auth.errors.js";
import { Clock } from "../common/clock.js";
import { FoodNameTakenError, FoodNotFoundError } from "./foods.errors.js";
import { FoodsPolicy } from "./foods.policy.js";
import type { FoodsQueries } from "./foods.queries.js";
import { FoodsService, toSeedColumns } from "./foods.service.js";
import { SEED_FOODS } from "./seed/seed-foods.js";

const superAdmin = { kind: "admin", role: "super_admin" } as AuthActor;
const pt = { kind: "admin", role: "pt" } as AuthActor;
const values = foodRequestSchema.parse({
  name: "Ức gà (chín)",
  group: "meat",
  kcal: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
});

const uniqueViolation = (constraint: string) =>
  new QueryFailedError("insert", [], {
    code: "23505",
    constraint,
  } as unknown as Error);

const setup = (
  overrides: { save?: () => unknown; execute?: () => unknown } = {},
) => {
  const queries = {
    findActiveByNameKey: vi.fn().mockResolvedValue(null),
    findActive: vi.fn().mockResolvedValue({ id: 1, name: "Ức gà (chín)" }),
  };
  const builder = {
    update: () => builder,
    set: () => builder,
    where: () => builder,
    returning: () => builder,
    execute: overrides.execute ?? (() => Promise.resolve({ raw: [{ id: 1 }] })),
  };
  const dataSource = {
    getRepository: () => ({
      save: overrides.save ?? (() => Promise.resolve({ id: 1 })),
    }),
    createQueryBuilder: () => builder,
  };
  const service = new FoodsService(
    dataSource as never,
    queries as unknown as FoodsQueries,
    new FoodsPolicy(),
    new Clock(),
  );

  return { service, queries };
};

describe("FoodsService", () => {
  it("refuses every write for a non-super admin before touching the database", async () => {
    const { service, queries } = setup();

    await expect(service.create(pt, values)).rejects.toThrow(
      RoleForbiddenError,
    );
    await expect(service.update(pt, 1, values)).rejects.toThrow(
      RoleForbiddenError,
    );
    await expect(service.archive(pt, 1)).rejects.toThrow(RoleForbiddenError);
    expect(queries.findActiveByNameKey).not.toHaveBeenCalled();
  });

  it("create: a taken name is a conflict; a race on the index is the same conflict", async () => {
    const taken = setup();

    taken.queries.findActiveByNameKey.mockResolvedValue({ id: 9 });
    await expect(taken.service.create(superAdmin, values)).rejects.toThrow(
      FoodNameTakenError,
    );

    const raced = setup({
      save: () => Promise.reject(uniqueViolation("foods_active_name_key")),
    });

    await expect(raced.service.create(superAdmin, values)).rejects.toThrow(
      FoodNameTakenError,
    );
  });

  it("create: other unique violations are not mistaken for a taken name", async () => {
    const other = setup({
      save: () => Promise.reject(uniqueViolation("something_else")),
    });

    await expect(other.service.create(superAdmin, values)).rejects.toThrow(
      QueryFailedError,
    );
  });

  it("update: checks the name against the other foods, then reports a missing row", async () => {
    const missing = setup({ execute: () => Promise.resolve({ raw: [] }) });

    await expect(missing.service.update(superAdmin, 5, values)).rejects.toThrow(
      FoodNotFoundError,
    );
    expect(missing.queries.findActiveByNameKey).toHaveBeenCalledWith(
      "uc ga (chin)",
      5,
    );
  });

  it("archive: a food that is not active is not found", async () => {
    const none = setup({ execute: () => Promise.resolve({ raw: [] }) });

    await expect(none.service.archive(superAdmin, 3)).rejects.toThrow(
      FoodNotFoundError,
    );
    await expect(
      setup().service.archive(superAdmin, 3),
    ).resolves.toBeUndefined();
  });
});

describe("toSeedColumns", () => {
  it("fills translations from the starter map and leaves optional serving null", () => {
    const chicken = toSeedColumns(SEED_FOODS[0]);

    expect(chicken).toMatchObject({
      name: "Ức gà (chín)",
      nameKey: "uc ga (chin)",
      nameEn: "Chicken breast (cooked)",
      nameZh: "鸡胸肉（熟）",
      servingLabel: null,
      servingGrams: null,
    });
  });
});
