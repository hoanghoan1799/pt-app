import { describe, expect, it } from "vitest";

import { SWIPE_MIN_PX, swipeDirection } from "@/utils/swipe";

describe("swipeDirection", () => {
  it("swiping left is next, right is previous", () => {
    expect(swipeDirection(-80, 5)).toBe("next");
    expect(swipeDirection(80, -5)).toBe("previous");
  });

  it("ignores short moves", () => {
    expect(swipeDirection(SWIPE_MIN_PX - 1, 0)).toBeNull();
    expect(swipeDirection(-(SWIPE_MIN_PX - 1), 0)).toBeNull();
    expect(swipeDirection(SWIPE_MIN_PX, 0)).toBe("previous");
  });

  it("ignores mostly vertical moves", () => {
    expect(swipeDirection(60, 100)).toBeNull();
    expect(swipeDirection(-60, -50)).toBeNull();
  });
});
