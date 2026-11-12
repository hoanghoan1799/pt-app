import {
  foodListQuerySchema,
  foodRequestSchema,
  foodResponseSchema,
} from "../food-api-schemas.js";
import { toFieldErrors } from "../form.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const CHICKEN = {
  name: "  Ức   gà (chín) ",
  group: "meat",
  state: "cooked",
  kcal: 165,
  protein: 31,
  carbs: 0,
  fat: "3,6",
};

const errorsOf = (input: unknown) => {
  const result = foodRequestSchema.safeParse(input);

  return result.success ? {} : toFieldErrors(result.error);
};

describe("foodRequestSchema", () => {
  it("takes numbers and decimal-comma text and normalises like the form", () => {
    const result = foodRequestSchema.safeParse(CHICKEN);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      name: "Ức gà (chín)",
      kcal: 165,
      fat: 3.6,
      fiber: null,
      servingLabel: "",
      servingGrams: null,
      source: "",
      confirmed: false,
    });
  });

  it("treats null optionals as absent and true as the ticked box", () => {
    const result = foodRequestSchema.safeParse({
      ...CHICKEN,
      kcal: 65,
      fiber: null,
      state: null,
      confirmed: true,
    });

    expect(result.data).toMatchObject({ state: null, confirmed: true });
  });

  it("gives the form messages for missing and bad fields", () => {
    expect(errorsOf({})).toMatchObject({
      name: "Nhập tên món",
      group: "Chọn nhóm món",
      kcal: "Nhập Calo",
    });
    expect(errorsOf({ ...CHICKEN, protein: "-3" })).toEqual({
      protein: "Protein không được âm",
    });
    expect(errorsOf({ ...CHICKEN, kcal: 65 }).kcal).toContain("lệch 141%");
  });
});

describe("foodListQuerySchema", () => {
  it("defaults the locale and limit and coerces the limit", () => {
    expect(foodListQuerySchema.parse({})).toEqual({ locale: "vi", limit: 50 });
    expect(foodListQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(foodListQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
    expect(foodListQuerySchema.safeParse({ group: "pizza" }).success).toBe(
      false,
    );
  });
});

describe("OpenAPI", () => {
  it("renders the request and response schemas", () => {
    expect(() =>
      z.toJSONSchema(foodRequestSchema, { io: "input" }),
    ).not.toThrow();
    expect(() => z.toJSONSchema(foodResponseSchema)).not.toThrow();
  });
});
