import {
  DISMISS_STORAGE_KEY,
  INSTALL_PROMPT_EVENT,
} from "@/features/pwa/constants";
import {
  detectInstallPlatform,
  type InstallPlatform,
  isDismissed,
} from "@/features/pwa/utils/detect-install-platform";

// Chrome's non-standard install prompt event.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    // Set by the inline script of the root layout (INSTALL_CAPTURE_SCRIPT).
    __ptInstallPrompt?: BeforeInstallPromptEvent | null;
    __ptInstalled?: boolean;
  }
}

// External store for useSyncExternalStore: the capture script owns the window
// values, this module only reads them and notifies on its own writes.
const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

export const subscribeInstall = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener(INSTALL_PROMPT_EVENT, listener);
  window.addEventListener("appinstalled", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener(INSTALL_PROMPT_EVENT, listener);
    window.removeEventListener("appinstalled", listener);
  };
};

export const getDeferredPrompt = () => window.__ptInstallPrompt ?? null;

// Storage can throw in private mode; a failed read just means "not dismissed".
const readDismissedAt = () => {
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);

    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
};

export const getDismissed = () => isDismissed(readDismissedAt(), Date.now());

export const dismissInstall = () => {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage blocked: the banner just reappears next visit.
  }
  notifyListeners();
};

// Takes the saved event (it can only be used once) and clears it first, so a
// second tap cannot reuse it.
export const takeDeferredPrompt = () => {
  const event = getDeferredPrompt();

  window.__ptInstallPrompt = null;
  notifyListeners();
  return event;
};

export const getPlatform = (): InstallPlatform =>
  detectInstallPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    isStandalone:
      window.__ptInstalled === true ||
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  });
