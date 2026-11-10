"use client";

import { type RefObject, useEffect, useState } from "react";

import {
  isAwayFromEdge,
  scrollBehaviorFor,
  type ScrollEdge,
} from "@/utils/scroll-rules";

interface UseScrollAwayOptions {
  edge: ScrollEdge;
  // Scrollable element; omit to track the window.
  container?: RefObject<HTMLElement | null>;
  // Pixels from the edge before the button shows. Default: one viewport.
  threshold?: number;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// True while the reader is farther than `threshold` from the top or bottom
// edge, plus a function that scrolls back to that edge.
export const useScrollAway = ({
  edge,
  container,
  threshold,
}: UseScrollAwayOptions) => {
  const [isAway, setIsAway] = useState(false);

  useEffect(() => {
    const element = container?.current ?? null;

    if (container && !element) {
      return;
    }
    const target =
      element ?? document.scrollingElement ?? document.documentElement;
    const scrollSource: HTMLElement | Window = element ?? window;
    let frame = 0;

    const check = () => {
      frame = 0;
      const viewport = element ? element.clientHeight : window.innerHeight;
      const away = isAwayFromEdge(
        edge,
        {
          scrollTop: target.scrollTop,
          scrollHeight: target.scrollHeight,
          clientHeight: element ? element.clientHeight : window.innerHeight,
        },
        threshold ?? viewport,
      );

      setIsAway(away);
    };
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(check);
      }
    };

    scrollSource.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);

    if (observer) {
      if (element) {
        observer.observe(element);
        if (element.firstElementChild) {
          observer.observe(element.firstElementChild);
        }
      } else {
        observer.observe(document.body);
      }
    }
    check();
    return () => {
      scrollSource.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [edge, container, threshold]);

  const scrollToEdge = () => {
    const behavior = scrollBehaviorFor(
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
    );
    const element = container?.current ?? null;

    if (element) {
      element.scrollTo({
        top: edge === "top" ? 0 : element.scrollHeight,
        behavior,
      });
      return;
    }
    window.scrollTo({
      top: edge === "top" ? 0 : document.documentElement.scrollHeight,
      behavior,
    });
  };

  return { isAway, scrollToEdge };
};
