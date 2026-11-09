import { describe, expect, it } from "vitest";

import { foodFormSchema } from "@/features/foods/services/food-schemas";
import { toFieldErrors } from "@/utils/form";

// Chicken breast, cooked: macros give 31 × 4 + 3.6 × 9 = 156.4 kcal.
const VALID = {
  name: "Ức gà (chín)",
  group: "meat",
  state: "cooked",
  kcal: "165",
  protein: "31",
  carbs: "0",
  fat: "3.6",
  fiber: "",
  servingLabel: "",
  servingGrams: "",
  source: "USDA FDC 171477",
};

const parse = (overrides: Record<string, string> = {}) =>
  foodFormSchema.safeParse({ ...VALID, ...overrides });

const getErrors = (overrides: Record<string, string> = {}) => {
  const result = parse(overrides);

  return result.success ? {} : toFieldErrors(result.error);
};

describe("foodFormSchema accepts good input", () => {
  it("parses the chicken breast form into numbers", () => {
    const result = parse();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Ức gà (chín)",
      group: "meat",
      state: "cooked",
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: null,
      servingLabel: "",
      servingGrams: null,
      nameEn: "",
      nameZh: "",
      source: "USDA FDC 171477",
      confirmed: false,
    });
  });

  it("accepts a decimal comma, collapses spaces and maps empty state to null", () => {
    const result = parse({ name: "  Ức   gà  ", fat: "3,6", state: "" });

    expect(result.data?.name).toBe("Ức gà");
    expect(result.data?.fat).toBe(3.6);
    expect(result.data?.state).toBeNull();
  });

  it("F3: accepts 165 kcal against 156.4 (5.2 % gap) without the box", () => {
    expect(parse({ kcal: "165" }).success).toBe(true);
  });

  it("accepts a serving with both label and grams", () => {
    const result = parse({ servingLabel: "1 tô", servingGrams: "500" });

    expect(result.data?.servingLabel).toBe("1 tô");
    expect(result.data?.servingGrams).toBe(500);
  });
});

describe("F4 kcal check", () => {
  it("refuses 65 kcal against 156.4 and says why", () => {
    const errors = getErrors({ kcal: "65" });

    expect(errors.kcal).toContain("Calo nhập 65 lệch 141%");
    expect(errors.kcal).toContain("156 kcal");
    expect(errors.kcal).toContain("Tôi đã kiểm tra số liệu");
  });

  it("accepts the same numbers when the PT ticks the box", () => {
    const result = parse({ kcal: "65", confirmed: "on" });

    expect(result.success).toBe(true);
    expect(result.data?.confirmed).toBe(true);
    expect(result.data?.kcal).toBe(65);
  });

  it("refuses just above 10 % and accepts exactly 10 %", () => {
    // Macros give 100 kcal (P 25): 112 is 10.7 % off, 111 is 9.9 %, 110 is 9.1 %.
    const macros = { protein: "25", carbs: "0", fat: "0" };

    expect(getErrors({ ...macros, kcal: "112" }).kcal).toBeDefined();
    expect(getErrors({ ...macros, kcal: "111" }).kcal).toBeUndefined();
    expect(getErrors({ ...macros, kcal: "110" }).kcal).toBeUndefined();
  });
});

describe("F6 bad input", () => {
  it("rejects an empty name", () => {
    expect(getErrors({ name: "   " }).name).toBe("Nhập tên món");
  });

  it("rejects a name longer than 80 characters", () => {
    expect(getErrors({ name: "a".repeat(81) }).name).toBe(
      "Tên tối đa 80 ký tự",
    );
  });

  it("rejects negative numbers", () => {
    expect(getErrors({ kcal: "-1" }).kcal).toBe("Calo không được âm");
    expect(getErrors({ protein: "-5" }).protein).toBe("Protein không được âm");
  });

  it("rejects exponent and hex spellings that Number() would accept", () => {
    expect(getErrors({ kcal: "1e2" }).kcal).toBe("Calo phải là số");
    expect(getErrors({ protein: "0x14" }).protein).toBe("Protein phải là số");
    expect(getErrors({ fat: "1e1" }).fat).toBe("Fat phải là số");
    expect(getErrors({ fiber: "0x1" }).fiber).toBe("Chất xơ phải là số");
  });

  it("reports only the broken field, not a kcal gap computed from bad macros", () => {
    expect(getErrors({ protein: "-3" })).toEqual({
      protein: "Protein không được âm",
    });
  });

  it("rejects empty and non-numeric numbers", () => {
    expect(getErrors({ carbs: "" }).carbs).toBe("Nhập Carb");
    expect(getErrors({ fat: "abc" }).fat).toBe("Fat phải là số");
  });

  it("rejects a macro above 100 g per 100 g", () => {
    expect(getErrors({ protein: "101" }).protein).toBe("Protein tối đa 100");
  });

  it("rejects macros that add up to more than 100 g per 100 g", () => {
    const errors = getErrors({
      protein: "50",
      carbs: "40",
      fat: "20",
      confirmed: "on",
    });

    expect(errors.fat).toBe(
      "Protein + carb + fat không vượt quá 100 g trên 100 g",
    );
  });

  it("rejects kcal above 910 per 100 g (pure fat is about 900)", () => {
    expect(getErrors({ kcal: "911", confirmed: "on" }).kcal).toBe(
      "Calo tối đa 910",
    );
  });

  it("rejects an unknown group and state", () => {
    expect(getErrors({ group: "pizza" }).group).toBe("Chọn nhóm món");
    expect(getErrors({ state: "burnt" }).state).toBe("Chọn trạng thái hợp lệ");
  });

  it("requires label and grams together for a serving", () => {
    expect(getErrors({ servingLabel: "1 tô" }).servingGrams).toBe(
      "Nhập khối lượng khẩu phần (gram)",
    );
    expect(getErrors({ servingGrams: "500" }).servingLabel).toBe(
      "Nhập tên khẩu phần, ví dụ 1 tô",
    );
    expect(
      getErrors({ servingLabel: "1 tô", servingGrams: "0" }).servingGrams,
    ).toBe("Khối lượng khẩu phần phải lớn hơn 0");
  });

  it("reports every bad field at once and never succeeds", () => {
    const result = parse({ name: "", kcal: "-1", protein: "x" });

    expect(result.success).toBe(false);
    expect(
      Object.keys(getErrors({ name: "", kcal: "-1", protein: "x" })),
    ).toEqual(expect.arrayContaining(["name", "kcal", "protein"]));
  });
});
