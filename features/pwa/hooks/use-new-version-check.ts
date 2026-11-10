"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  BUILD_ID,
  IS_PWA_ENABLED,
  NEW_VERSION_TOAST_ID,
} from "@/features/pwa/constants";
import {
  isNewerBuild,
  shouldCheck,
  VERSION_CHECK_INTERVAL_MS,
} from "@/features/pwa/utils/version-check";

// Asks the server which build is live when the page comes back to the
// foreground. An installed PWA resumed from memory keeps its old page and never
// re-registers the worker, so this is the only way it learns about a deploy.
// It never reloads on its own: unsaved workout input must not be lost.
export const useNewVersionCheck = () => {
  const t = useTranslations("pwa.newVersion");
  const message = t("message");
  const reloadLabel = t("reload");
  const lastCheckedAt = useRef<number | null>(null);
  const isShown = useRef(false);

  useEffect(() => {
    if (!IS_PWA_ENABLED || BUILD_ID === "dev") {
      return;
    }

    const check = async () => {
      const now = Date.now();

      if (
        isShown.current ||
        !shouldCheck(lastCheckedAt.current, now, VERSION_CHECK_INTERVAL_MS)
      ) {
        return;
      }
      lastCheckedAt.current = now;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const data: unknown = await response.json();
        const latest =
          typeof data === "object" && data !== null && "buildId" in data
            ? data.buildId
            : null;

        if (!isNewerBuild(BUILD_ID, latest) || isShown.current) {
          return;
        }
        isShown.current = true;
        toast(message, {
          id: NEW_VERSION_TOAST_ID,
          duration: Infinity,
          action: {
            label: reloadLabel,
            onClick: () => window.location.reload(),
          },
        });
      } catch {
        // Offline or a bad response: try again at the next resume.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void check();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    void check();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [message, reloadLabel]);
};
