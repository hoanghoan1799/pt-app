"use client";

import { useMemo, useSyncExternalStore } from "react";

const subscribe = (listener: () => void) => {
  const viewport = window.visualViewport;

  if (!viewport) {
    return () => undefined;
  }
  viewport.addEventListener("resize", listener);
  viewport.addEventListener("scroll", listener);
  return () => {
    viewport.removeEventListener("resize", listener);
    viewport.removeEventListener("scroll", listener);
  };
};

// "offsetTop:height" as text, so the snapshot is stable between changes.
const getSnapshot = () => {
  const viewport = window.visualViewport;

  return viewport
    ? `${Math.round(viewport.offsetTop)}:${Math.round(viewport.height)}`
    : "";
};

// The part of the page that is really visible (iOS shrinks it, not the layout
// viewport, when the keyboard opens). Null when the browser has no such API.
export const useVisualViewport = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "");

  return useMemo(() => {
    if (snapshot === "") {
      return null;
    }
    const [offsetTop, height] = snapshot.split(":").map(Number);

    return { offsetTop, height };
  }, [snapshot]);
};
