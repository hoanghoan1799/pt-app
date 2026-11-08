"use client";

import { useBackgroundLock } from "@/features/auth/hooks/use-background-lock";

// Renders nothing; mounted in the admin protected layout when the admin has
// a passcode.
export const BackgroundLock = () => {
  useBackgroundLock(true);

  return null;
};
