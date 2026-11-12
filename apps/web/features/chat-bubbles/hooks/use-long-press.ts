"use client";

import { type MouseEvent, type PointerEvent, useEffect, useRef } from "react";

import {
  HAPTIC_MS,
  LONG_PRESS_MOVE,
  LONG_PRESS_MS,
} from "@/features/chat-bubbles/constants";

// Long-press (about 500 ms) for a row that is also a link. A finger that moves
// more than 10 px is a scroll; the click that follows a long-press is
// swallowed so the link does not open. Right click / Android long-press menu
// do the same action.
export const useLongPress = (onLongPress: () => void, disabled = false) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  };

  useEffect(() => clear, []);

  const fire = () => {
    fired.current = true;
    navigator.vibrate?.(HAPTIC_MS);
    onLongPress();
  };

  if (disabled) {
    return {};
  }
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      clear();
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        fire();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      const start = origin.current;

      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >
          LONG_PRESS_MOVE
      ) {
        clear();
      }
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      clear();
      if (!fired.current) {
        fire();
      }
    },
    onClickCapture: (event: MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
};
