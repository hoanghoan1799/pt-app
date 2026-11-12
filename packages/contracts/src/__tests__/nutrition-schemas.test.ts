import { toFieldErrors } from "../form.js";
import {
  bodyProfileSchema,
  myBodyProfileSchema,
} from "../nutrition-schemas.js";
import { describe, expect, it } from "vitest";

const VALID = {
  userId: "1",
  sex: "female",
  age: "28",
  heightCm: "160",
  weightKg: "55,5",
  activityLevel: "light",
  kcalAdjustment: "-200",
  proteinPerKg: "1,6",
};

const errorsFor = (overrides: Record<string, string>) => {
  const result = bodyProfileSchema.safeParse({ ...VALID, ...overrides });

  return result.success ? null : toFieldErrors(result.error);
};

describe("bodyProfileSchema", () => {
  it("parses signed kcal and decimal-comma protein", () => {
    expect(bodyProfileSchema.parse(VALID)).toMatchObject({
      weightKg: 55.5,
      kcalAdjustment: -200,
      proteinPerKg: 1.6,
    });
    expect(
      bodyProfileSchema.parse({ ...VALID, kcalAdjustment: "+300" })
        .kcalAdjustment,
    ).toBe(300);
  });

  it("accepts the bounds and rejects outside them", () => {
    expect(errorsFor({ kcalAdjustment: "1500" })).toBeNull();
    expect(errorsFor({ kcalAdjustment: "-1500" })).toBeNull();
    expect(errorsFor({ proteinPerKg: "1" })).toBeNull();
    expect(errorsFor({ proteinPerKg: "3" })).toBeNull();
    expect(errorsFor({ kcalAdjustment: "1501" })).toHaveProperty(
      "kcalAdjustment",
    );
    expect(errorsFor({ kcalAdjustment: "-1501" })).toHaveProperty(
      "kcalAdjustment",
    );
    expect(errorsFor({ proteinPerKg: "0,9" })).toHaveProperty("proteinPerKg");
    expect(errorsFor({ proteinPerKg: "3,1" })).toHaveProperty("proteinPerKg");
  });

  it("rejects missing, fractional and non-numeric values", () => {
    expect(errorsFor({ kcalAdjustment: "" })).toHaveProperty("kcalAdjustment");
    expect(errorsFor({ kcalAdjustment: "-200,5" })).toHaveProperty(
      "kcalAdjustment",
    );
    expect(errorsFor({ kcalAdjustment: "abc" })).toHaveProperty(
      "kcalAdjustment",
    );
    expect(errorsFor({ proteinPerKg: "" })).toHaveProperty("proteinPerKg");
    expect(errorsFor({ proteinPerKg: "1e0" })).toHaveProperty("proteinPerKg");
    expect(errorsFor({ proteinPerKg: "1,65" })).toHaveProperty("proteinPerKg");
    expect(errorsFor({ proteinPerKg: "2.05" })).toHaveProperty("proteinPerKg");
    expect(errorsFor({ proteinPerKg: "2,0" })).toBeNull();
  });
});

describe("myBodyProfileSchema", () => {
  it("takes the legacy goal and never the energy model", () => {
    const parsed = myBodyProfileSchema.parse({ ...VALID, goal: "cut" });

    expect(parsed.goal).toBe("cut");
    expect(parsed).not.toHaveProperty("kcalAdjustment");
    expect(parsed).not.toHaveProperty("proteinPerKg");
  });
});
