"use client";

import { type PointerEvent, useRef, useState } from "react";

import { BUBBLE_SIZE } from "@/features/chat-bubbles/constants";
import type { Point } from "@/features/chat-bubbles/types";
import {
  exceedsDragThreshold,
  isInCloseZone,
} from "@/features/chat-bubbles/utils/bubble-geometry";

export interface DragState {
  key: string;
  dx: number;
  dy: number;
  // Past the 8 px threshold: it is a drag, not a tap.
  moved: boolean;
  // The bubble is over the close target.
  hot: boolean;
}

interface Options {
  // Top-left of a bubble now, in layer coordinates.
  positionOf: (key: string) => Point;
  zoneCenter: Point;
  onTap: (key: string) => void;
  onDrop: (key: string, topLeft: Point) => void;
  onCloseDrop: (key: string) => void;
}

// Pointer handlers for one bubble (finger, pen or mouse): a tap, or a drag
// that ends in a drop or on the close target.
export const useBubbleDrag = ({
  positionOf,
  zoneCenter,
  onTap,
  onDrop,
  onCloseDrop,
}: Options) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<{
    key: string;
    x: number;
    y: number;
    origin: Point;
    moved: boolean;
  } | null>(null);

  const measure = (event: PointerEvent, key: string) => {
    const start = press.current;

    if (!start) {
      return null;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    start.moved = start.moved || exceedsDragThreshold(dx, dy);
    const center = {
      x: start.origin.x + dx + BUBBLE_SIZE / 2,
      y: start.origin.y + dy + BUBBLE_SIZE / 2,
    };

    return {
      key,
      dx,
      dy,
      moved: start.moved,
      hot: start.moved && isInCloseZone(center, zoneCenter),
    };
  };

  const finish = (event: PointerEvent, key: string, cancelled: boolean) => {
    const state = measure(event, key);
    const start = press.current;

    press.current = null;
    setDrag(null);
    if (!state || !start || cancelled) {
      return;
    }
    if (!state.moved) {
      onTap(key);
    } else if (state.hot) {
      onCloseDrop(key);
    } else {
      onDrop(key, {
        x: start.origin.x + state.dx,
        y: start.origin.y + state.dy,
      });
    }
  };

  const handlersFor = (key: string) => ({
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      press.current = {
        key,
        x: event.clientX,
        y: event.clientY,
        origin: positionOf(key),
        moved: false,
      };
      setDrag({ key, dx: 0, dy: 0, moved: false, hot: false });
    },
    onPointerMove: (event: PointerEvent) => {
      const state = measure(event, key);

      if (state) {
        setDrag(state);
      }
    },
    onPointerUp: (event: PointerEvent) => finish(event, key, false),
    onPointerCancel: (event: PointerEvent) => finish(event, key, true),
  });

  return { drag, handlersFor };
};
