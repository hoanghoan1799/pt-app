import { DISMISS_DAYS } from "@/features/pwa/constants";

export type InstallPlatform =
  "installed" | "ios" | "in-app" | "android" | "other";

interface DetectInput {
  userAgent: string;
  maxTouchPoints: number;
  isStandalone: boolean;
}

// In-app browsers that cannot install a PWA or add to the home screen.
const IN_APP_PATTERN = /Zalo|FBAN|FBAV|FB_IAB|Instagram|\bLine\/|Messenger/i;
const IOS_PATTERN = /iPhone|iPod|iPad/;
const DAY_MS = 24 * 60 * 60 * 1000;

// iPadOS 13+ reports a desktop Safari UA, so touch points tell it apart from a Mac.
const isIos = (userAgent: string, maxTouchPoints: number) =>
  IOS_PATTERN.test(userAgent) ||
  (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

// iOS Chrome/Firefox/Edge can also add to the home screen (iOS 16.4+), so every
// iOS browser maps to "ios".
export const detectInstallPlatform = ({
  userAgent,
  maxTouchPoints,
  isStandalone,
}: DetectInput): InstallPlatform => {
  if (isStandalone) {
    return "installed";
  }
  if (IN_APP_PATTERN.test(userAgent)) {
    return "in-app";
  }
  if (isIos(userAgent, maxTouchPoints)) {
    return "ios";
  }
  if (/Android/i.test(userAgent)) {
    return "android";
  }
  return "other";
};

// True while the last "Để sau" is less than DISMISS_DAYS old.
export const isDismissed = (dismissedAt: number | null, now: number) =>
  dismissedAt !== null &&
  Number.isFinite(dismissedAt) &&
  now - dismissedAt < DISMISS_DAYS * DAY_MS;
