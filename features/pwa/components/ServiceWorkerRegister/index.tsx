"use client";

import { useEffect } from "react";

import { BUILD_ID, IS_PWA_ENABLED } from "@/features/pwa/constants";
import { useNewVersionCheck } from "@/features/pwa/hooks/use-new-version-check";

// The worker version lives only in the `?v=` URL (sw.js bytes never change), so
// update() from an old page cannot find a new worker. A page resumed from
// memory never re-registers, hence useNewVersionCheck asks /api/version.
export const ServiceWorkerRegister = () => {
  useNewVersionCheck();

  useEffect(() => {
    if (!IS_PWA_ENABLED || !("serviceWorker" in navigator)) {
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
