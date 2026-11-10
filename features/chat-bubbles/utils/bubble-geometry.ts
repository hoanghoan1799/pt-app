import {
  BOTTOM_RESERVED,
  BUBBLE_SIZE,
  CLOSE_RADIUS,
  DRAG_THRESHOLD,
  EDGE_GAP,
  ROW_GAP,
  STACK_OFFSET,
  TOP_MIN,
} from "@/features/chat-bubbles/constants";
import type { BubbleAnchor, Point, Size } from "@/features/chat-bubbles/types";

// A press that moved less than the threshold is a tap, not a drag.
export const exceedsDragThreshold = (dx: number, dy: number) =>
  Math.hypot(dx, dy) >= DRAG_THRESHOLD;

// Which edge a bubble released at `centerX` snaps to.
export const snapSide = (centerX: number, viewportWidth: number) =>
  centerX < viewportWidth / 2 ? "left" : "right";

// Keeps a bubble's top edge between the top margin and the tab bar.
export const clampY = (y: number, viewportHeight: number) =>
  Math.min(
    Math.max(TOP_MIN, y),
    Math.max(TOP_MIN, viewportHeight - BUBBLE_SIZE - BOTTOM_RESERVED),
  );

export const anchorFromDrop = (
  topLeft: Point,
  viewport: Size,
): BubbleAnchor => ({
  side: snapSide(topLeft.x + BUBBLE_SIZE / 2, viewport.width),
  yRatio:
    viewport.height > 0
      ? clampY(topLeft.y, viewport.height) / viewport.height
      : 0,
});

// Top-left of the stack's top bubble.
export const anchorToPoint = (anchor: BubbleAnchor, viewport: Size): Point => ({
  x:
    anchor.side === "left" ? EDGE_GAP : viewport.width - BUBBLE_SIZE - EDGE_GAP,
  y: clampY(anchor.yRatio * viewport.height, viewport.height),
});

// Collapsed: the newest bubble is on top, older ones peek out 5 px each.
// Index 0 is the oldest.
export const stackPositions = (
  count: number,
  anchor: BubbleAnchor,
  viewport: Size,
): Point[] => {
  const base = anchorToPoint(anchor, viewport);
  const dir = anchor.side === "left" ? 1 : -1;

  return Array.from({ length: count }, (_unused, index) => {
    const depth = count - 1 - index;

    return {
      x: base.x + dir * depth * STACK_OFFSET,
      y: base.y + depth * STACK_OFFSET,
    };
  });
};

// Expanded: one row at the top, right aligned.
export const rowPositions = (count: number, viewport: Size): Point[] => {
  const total = count * BUBBLE_SIZE + Math.max(0, count - 1) * ROW_GAP;
  const startX = Math.max(EDGE_GAP, viewport.width - EDGE_GAP - total);

  return Array.from({ length: count }, (_unused, index) => ({
    x: startX + index * (BUBBLE_SIZE + ROW_GAP),
    y: TOP_MIN,
  }));
};

// Is the dragged bubble's centre close enough to the close target?
export const isInCloseZone = (
  center: Point,
  zoneCenter: Point,
  radius = CLOSE_RADIUS,
) => Math.hypot(center.x - zoneCenter.x, center.y - zoneCenter.y) < radius;
