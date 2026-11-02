"use client";

import { useCallback, useEffect, useState } from "react";

import { DISMISS_STORAGE_KEY } from "@/features/pwa/constants";
import {
  detectInstallPlatform,
  type InstallPlatform,
  isDismissed,
} from "@/features/pwa/utils/detect-install-platform";

// Chrome's non-standard install prompt event.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const readDismissedAt = () => {
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);

    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
};

const writeDismissedAt = (value: number) => {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(value));
  } catch {
    // Storage blocked (private mode): the banner just reappears next visit.
  }
};

const readIsStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const useInstallPrompt = () => {
  // null until mounted so the server and first client render both show nothing.
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Browser-only values, read once after mount to avoid a hydration mismatch.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPlatform(
      detectInstallPlatform({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        isStandalone: readIsStandalone(),
      }),
    );
    setDismissed(isDismissed(readDismissedAt(), Date.now()));
    /* eslint-enable react-hooks/set-state-in-effect */

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setPlatform("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    writeDismissedAt(Date.now());
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    // The saved event can only be used once.
    setDeferredPrompt(null);
    if (outcome === "dismissed") {
      dismiss();
    }
  }, [deferredPrompt, dismiss]);

  const needsPrompt = platform === "android" || platform === "other";
  const visible =
    platform !== null &&
    platform !== "installed" &&
    !dismissed &&
    (needsPrompt ? deferredPrompt !== null : true);

  return { visible, platform, install, dismiss };
};
