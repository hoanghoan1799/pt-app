import { describe, expect, it } from "vitest";

import {
  getSizeClasses,
  getSlotClasses,
  shouldShowClear,
} from "@/components/common/Input/input-classes";

const base = {
  size: "md",
  hasLeading: false,
  hasTrailing: false,
  showClear: false,
  clearPosition: "end",
} as const;

describe("getSlotClasses", () => {
  it("uses plain padding with no slots", () => {
    expect(getSlotClasses(base)).toBe("pl-4 pr-4");
  });

  it("pads the left for a leading icon", () => {
    expect(getSlotClasses({ ...base, hasLeading: true })).toBe("pl-11 pr-4");
  });

  it("pads the right for the clear button at the end", () => {
    expect(getSlotClasses({ ...base, showClear: true })).toBe("pl-4 pr-11");
  });

  it("pads the left for the clear button at the start", () => {
    expect(
      getSlotClasses({ ...base, showClear: true, clearPosition: "start" }),
    ).toBe("pl-11 pr-4");
  });

  it("doubles the right padding for clear plus trailing icon", () => {
    expect(
      getSlotClasses({ ...base, showClear: true, hasTrailing: true }),
    ).toBe("pl-4 pr-22");
  });

  it("doubles the left padding for leading icon plus start clear", () => {
    expect(
      getSlotClasses({
        ...base,
        hasLeading: true,
        showClear: true,
        clearPosition: "start",
      }),
    ).toBe("pl-22 pr-4");
  });

  it("uses wider slots for lg", () => {
    expect(getSlotClasses({ ...base, size: "lg", hasLeading: true })).toBe(
      "pl-12 pr-4",
    );
  });
});

describe("getSizeClasses", () => {
  it("maps sizes to min height", () => {
    expect(getSizeClasses("sm")).toBe("min-h-10 text-sm");
    expect(getSizeClasses("md")).toBe("min-h-12");
    expect(getSizeClasses("lg")).toBe("min-h-14");
  });
});

describe("shouldShowClear", () => {
  const on = { clearable: true, hasValue: true };

  it("shows when clearable with a value", () => {
    expect(shouldShowClear(on)).toBe(true);
  });

  it("hides when not clearable, empty, disabled or read-only", () => {
    expect(shouldShowClear({ ...on, clearable: false })).toBe(false);
    expect(shouldShowClear({ ...on, hasValue: false })).toBe(false);
    expect(shouldShowClear({ ...on, disabled: true })).toBe(false);
    expect(shouldShowClear({ ...on, readOnly: true })).toBe(false);
  });
});
