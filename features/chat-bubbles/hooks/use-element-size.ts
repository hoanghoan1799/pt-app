"use client";

import { useEffect, useRef, useState } from "react";

import type { Size } from "@/features/chat-bubbles/types";

// The size of the referenced element, kept current (0 x 0 until measured).
export const useElementSize = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;

      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
};
