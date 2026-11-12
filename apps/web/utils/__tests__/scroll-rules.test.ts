import { describe, expect, it } from "vitest";

import {
  distanceFromEdge,
  formatJumpCount,
  isAwayFromEdge,
  scrollBehaviorFor,
} from "@/utils/scroll-rules";

const m = (scrollTop: number, scrollHeight = 2000, clientHeight = 800) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe("distanceFromEdge", () => {
  it("measures from the top", () => {
    expect(distanceFromEdge("top", m(350))).toBe(350);
  });

  it("measures from the bottom", () => {
    expect(distanceFromEdge("bottom", m(350))).toBe(850);
    expect(distanceFromEdge("bottom", m(1200))).toBe(0);
  });

  it("clamps iOS overscroll to 0", () => {
    expect(distanceFromEdge("top", m(-40))).toBe(0);
    expect(distanceFromEdge("bottom", m(1240))).toBe(0);
  });

  it("is 0 when the content fits", () => {
    expect(distanceFromEdge("bottom", m(0, 500, 800))).toBe(0);
  });
});

describe("isAwayFromEdge", () => {
  it("is false exactly at the threshold", () => {
    expect(isAwayFromEdge("top", m(800), 800)).toBe(false);
  });

  it("is true one pixel past the threshold", () => {
    expect(isAwayFromEdge("top", m(801), 800)).toBe(true);
    expect(isAwayFromEdge("bottom", m(399), 800)).toBe(true);
    expect(isAwayFromEdge("bottom", m(400), 800)).toBe(false);
  });

  it("is false during overscroll", () => {
    expect(isAwayFromEdge("top", m(-60), 0)).toBe(false);
    expect(isAwayFromEdge("bottom", m(1300), 0)).toBe(false);
  });
});

describe("scrollBehaviorFor", () => {
  it("uses auto for reduced motion", () => {
    expect(scrollBehaviorFor(true)).toBe("auto");
  });

  it("uses smooth otherwise", () => {
    expect(scrollBehaviorFor(false)).toBe("smooth");
  });
});

describe("formatJumpCount", () => {
  it("hides zero, negative and NaN", () => {
    expect(formatJumpCount(0)).toBeNull();
    expect(formatJumpCount(-3)).toBeNull();
    expect(formatJumpCount(Number.NaN)).toBeNull();
  });

  it("shows the number up to 99", () => {
    expect(formatJumpCount(1)).toBe("1");
    expect(formatJumpCount(99)).toBe("99");
  });

  it("caps above 99", () => {
    expect(formatJumpCount(100)).toBe("99+");
    expect(formatJumpCount(1234)).toBe("99+");
  });
});
