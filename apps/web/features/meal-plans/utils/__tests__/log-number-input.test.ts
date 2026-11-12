import { describe, expect, it } from "vitest";

import {
  parseOptionalNumber,
  toFieldText,
} from "@/features/meal-plans/utils/log-number-input";

describe("parseOptionalNumber", () => {
  it("treats empty text as not given", () => {
    expect(parseOptionalNumber("", 1000)).toBeNull();
    expect(parseOptionalNumber("   ", 1000)).toBeNull();
  });

  it("reads a number with a decimal comma or point", () => {
    expect(parseOptionalNumber("7,2", 1000)).toBe(7.2);
    expect(parseOptionalNumber("7.2", 1000)).toBe(7.2);
    expect(parseOptionalNumber("0", 1000)).toBe(0);
  });

  it("flags text, negatives and values above the maximum", () => {
    expect(parseOptionalNumber("abc", 1000)).toBe("invalid");
    expect(parseOptionalNumber("-1", 1000)).toBe("invalid");
    expect(parseOptionalNumber("1001", 1000)).toBe("invalid");
    expect(parseOptionalNumber("1000", 1000)).toBe(1000);
  });
});

describe("toFieldText", () => {
  it("formats with a decimal comma and leaves null empty", () => {
    expect(toFieldText(7.2)).toBe("7,2");
    expect(toFieldText(1250)).toBe("1250");
    expect(toFieldText(null)).toBe("");
  });
});
