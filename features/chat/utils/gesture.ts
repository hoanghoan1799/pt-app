// Touch gestures on a chat bubble, as pure timing rules (no React, no DOM):
// double-tap toggles my heart, a long press opens the actions sheet, and a
// finger that moves is a scroll, never a tap.

export const DOUBLE_TAP_MS = 300;
export const LONG_PRESS_MS = 450;
export const MOVE_TOLERANCE_PX = 10;

export interface Point {
  x: number;
  y: number;
}

export interface TimedPoint extends Point {
  time: number;
}

// Up to the tolerance counts as "did not move".
export const isWithinTolerance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= MOVE_TOLERANCE_PX;

// Two taps within 300 ms of each other (finger lifted both times) that land
// close together.
export const isDoubleTap = (previous: TimedPoint | null, next: TimedPoint) =>
  previous !== null &&
  next.time - previous.time <= DOUBLE_TAP_MS &&
  isWithinTolerance(previous, next);

export interface GestureHandlers {
  onDoubleTap: () => void;
  onLongPress: () => void;
}

export interface GestureClock {
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

const SYSTEM_CLOCK: GestureClock = {
  now: () => Date.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// One recogniser per bubble. Feed it pointer down / move / up / cancel.
export const createGestureTracker = (
  initialHandlers: GestureHandlers,
  clock: GestureClock = SYSTEM_CLOCK,
) => {
  let handlers = initialHandlers;
  let start: Point | null = null;
  let timer: unknown = null;
  let didLongPress = false;
  let lastTap: TimedPoint | null = null;

  const clearPress = () => {
    if (timer !== null) {
      clock.clearTimer(timer);
      timer = null;
    }
  };

  return {
    // Swap the callbacks without losing a pending tap.
    setHandlers(next: GestureHandlers) {
      handlers = next;
    },
    down(point: Point) {
      clearPress();
      start = point;
      didLongPress = false;
      timer = clock.setTimer(() => {
        timer = null;
        didLongPress = true;
        lastTap = null;
        handlers.onLongPress();
      }, LONG_PRESS_MS);
    },
    // A finger that drifts is scrolling: drop the long press and the tap.
    move(point: Point) {
      if (start !== null && !isWithinTolerance(start, point)) {
        clearPress();
        start = null;
        lastTap = null;
      }
    },
    up(point: Point) {
      clearPress();
      const wasTap = start !== null && !didLongPress;

      start = null;
      if (!wasTap) {
        return;
      }
      const tap: TimedPoint = { ...point, time: clock.now() };

      if (isDoubleTap(lastTap, tap)) {
        lastTap = null;
        handlers.onDoubleTap();
      } else {
        lastTap = tap;
      }
    },
    cancel() {
      clearPress();
      start = null;
    },
  };
};
