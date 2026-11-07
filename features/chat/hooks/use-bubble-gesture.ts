"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

import {
  createGestureTracker,
  type GestureHandlers,
} from "@/features/chat/utils/gesture";

const HAPTIC_MS = 10;

// Controls inside a bubble (retry, quote, chips, "edited") keep their own
// taps; they never start a gesture.
const isInteractiveTarget = (target: EventTarget) =>
  target instanceof Element && target.closest("button, a") !== null;

// Pointer handlers for one bubble: double-tap, long-press, and the keyboard /
// context-menu route to the same actions sheet. `isEnabled` false = inert.
export const useBubbleGesture = (
  isEnabled: boolean,
  { onDoubleTap, onLongPress, onSingleTap }: GestureHandlers,
) => {
  const [tracker] = useState(() =>
    createGestureTracker({ onDoubleTap, onLongPress, onSingleTap }),
  );

  // Latest callbacks, without rebuilding the tracker (and losing a pending tap).
  useEffect(() => {
    tracker.setHandlers({
      onDoubleTap,
      onSingleTap,
      onLongPress: () => {
        navigator.vibrate?.(HAPTIC_MS);
        onLongPress();
      },
    });
  });

  useEffect(() => () => tracker.dispose(), [tracker]);

  if (!isEnabled) {
    return {};
  }
  return {
    onPointerDown: (event: PointerEvent) => {
      // Only the primary button / finger; a right click is the context menu.
      if (event.button !== 0 || isInteractiveTarget(event.target)) {
        return;
      }
      tracker.down({ x: event.clientX, y: event.clientY });
    },
    onPointerMove: (event: PointerEvent) =>
      tracker.move({ x: event.clientX, y: event.clientY }),
    onPointerUp: (event: PointerEvent) =>
      tracker.up({ x: event.clientX, y: event.clientY }),
    // The browser took the touch over to scroll.
    onPointerCancel: () => tracker.cancel(),
    onPointerLeave: () => tracker.cancel(),
    // Long press on Android and right click on desktop.
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      if (!isInteractiveTarget(event.target)) {
        onLongPress();
      }
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (
        event.target === event.currentTarget &&
        (event.key === "Enter" ||
          event.key === "ContextMenu" ||
          (event.key === "F10" && event.shiftKey))
      ) {
        event.preventDefault();
        onLongPress();
      }
    },
  };
};
