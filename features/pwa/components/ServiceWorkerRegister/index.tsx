"use client";

import { useEffect } from "react";

// Dev keeps hot reload free of a worker unless NEXT_PUBLIC_ENABLE_SW=1 (e2e).
const isEnabled =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ENABLE_SW === "1";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (!isEnabled || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`, {
        scope: "/",
        updateViaCache: "none",
      })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Service worker registration failed", error);
        }
      });
  }, []);

  return null;
};
