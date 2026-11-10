"use client";

import { useBackgroundLock } from "@/features/auth/hooks/use-background-lock";
import { useIsEmbedded } from "@/features/chat-bubbles/hooks/use-is-embedded";

// Renders nothing; mounted in the admin protected layout when the admin has
// a passcode.
export const BackgroundLock = () => {
  // The chat inside a bubble panel never redirects the frame to the lock screen;
  // the parent page owns that.
  useBackgroundLock(!useIsEmbedded());

  return null;
};
