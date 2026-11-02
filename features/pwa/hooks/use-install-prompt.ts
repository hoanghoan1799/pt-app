"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  dismissInstall,
  getDeferredPrompt,
  getDismissed,
  getPlatform,
  subscribeInstall,
  takeDeferredPrompt,
} from "@/features/pwa/utils/install-store";

export const useInstallPrompt = () => {
  // Server snapshots hide everything, so server and first client render match.
  const platform = useSyncExternalStore(
    subscribeInstall,
    getPlatform,
    () => null,
  );
  const dismissed = useSyncExternalStore(
    subscribeInstall,
    getDismissed,
    () => true,
  );
  const deferredPrompt = useSyncExternalStore(
    subscribeInstall,
    getDeferredPrompt,
    () => null,
  );

  const install = useCallback(async () => {
    // Clears the saved event before awaiting, so a double tap is ignored.
    const event = takeDeferredPrompt();

    if (!event) {
      return;
    }
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;

      if (outcome === "dismissed") {
        dismissInstall();
      }
    } catch {
      // The browser refused or the prompt was torn down; the event is already
      // cleared, so the banner waits for the next beforeinstallprompt.
    }
  }, []);

  const needsPrompt = platform === "android" || platform === "other";
  const visible =
    platform !== null &&
    platform !== "installed" &&
    !dismissed &&
    (needsPrompt ? deferredPrompt !== null : true);

  return { visible, platform, install, dismiss: dismissInstall };
};
