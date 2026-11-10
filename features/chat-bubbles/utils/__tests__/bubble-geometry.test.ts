import { describe, expect, it } from "vitest";

import {
  anchorFromDrop,
  anchorToPoint,
  clampY,
  exceedsDragThreshold,
  isInCloseZone,
  rowPositions,
  snapSide,
  stackPositions,
} from "@/features/chat-bubbles/utils/bubble-geometry";

const viewport = { width: 400, height: 800 };

describe("drag rules", () => {
  it("separates a tap from a drag at 8 px", () => {
    expect(exceedsDragThreshold(5, 5)).toBe(false);
    expect(exceedsDragThreshold(0, 7.9)).toBe(false);
    expect(exceedsDragThreshold(8, 0)).toBe(true);
    expect(exceedsDragThreshold(6, 6)).toBe(true);
  });

  it("snaps to the nearest edge", () => {
    expect(snapSide(199, 400)).toBe("left");
    expect(snapSide(200, 400)).toBe("right");
  });

  it("clamps y between the top margin and the tab bar", () => {
    expect(clampY(-50, 800)).toBe(34);
    expect(clampY(300, 800)).toBe(300);
    expect(clampY(9999, 800)).toBe(800 - 56 - 90);
    expect(clampY(10, 100)).toBe(34);
  });

  it("turns a drop into an edge anchor and back to a point", () => {
    const anchor = anchorFromDrop({ x: 20, y: 400 }, viewport);

    expect(anchor).toEqual({ side: "left", yRatio: 0.5 });
    expect(anchorToPoint(anchor, viewport)).toEqual({ x: 8, y: 400 });
    expect(anchorToPoint({ side: "right", yRatio: 0.5 }, viewport)).toEqual({
      x: 400 - 56 - 8,
      y: 400,
    });
  });

  it("hits the close zone within 80 px of its centre", () => {
    const zone = { x: 200, y: 700 };

    expect(isInCloseZone({ x: 200, y: 621 }, zone)).toBe(true);
    expect(isInCloseZone({ x: 200, y: 620 }, zone)).toBe(false);
    expect(isInCloseZone({ x: 100, y: 100 }, zone)).toBe(false);
  });
});

describe("layouts", () => {
  it("stacks with the newest on top and 5 px offsets towards the screen", () => {
    const right = stackPositions(3, { side: "right", yRatio: 0.5 }, viewport);

    expect(right[2]).toEqual({ x: 336, y: 400 });
    expect(right[1]).toEqual({ x: 331, y: 405 });
    expect(right[0]).toEqual({ x: 326, y: 410 });
    const left = stackPositions(2, { side: "left", yRatio: 0.5 }, viewport);

    expect(left[0]).toEqual({ x: 13, y: 405 });
  });

  it("lines the row up at the top, right aligned", () => {
    const row = rowPositions(3, viewport);

    expect(row.map((point) => point.y)).toEqual([34, 34, 34]);
    expect(row.map((point) => point.x)).toEqual([
      400 - 8 - (3 * 56 + 2 * 10),
      400 - 8 - (3 * 56 + 2 * 10) + 66,
      400 - 8 - (3 * 56 + 2 * 10) + 132,
    ]);
    expect(rowPositions(1, viewport)[0].x).toBe(336);
  });
});
