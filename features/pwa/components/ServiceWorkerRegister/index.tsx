"use client";

import { useEffect } from "react";

// Dev keeps hot reload free of a worker unless NEXT_PUBLIC_ENABLE_SW=1 (e2e).
const isEnabled =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ENABLE_SW === "1";

export const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (!isEnabled || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Service worker registration failed", error);
        }
      });
  }, []);

  return null;
};
