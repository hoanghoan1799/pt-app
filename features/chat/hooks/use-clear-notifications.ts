"use client";

import { useEffect } from "react";

import { clearNotifications } from "@/features/chat/utils/clear-notifications";

// Closes this conversation's notifications while it is open and visible: on
// open, when the page becomes visible again and whenever `trigger` changes
// (a new message came in while reading, so its push was just shown).
export const useClearNotifications = (
  tags: readonly string[] | null,
  trigger: unknown,
) => {
  const key = tags?.join("|") ?? "";

  useEffect(() => {
    if (key === "") {
      return;
    }
    const list = key.split("|");
    const clearIfVisible = () => {
      if (document.visibilityState === "visible") {
        void clearNotifications(list);
      }
    };

    clearIfVisible();
    document.addEventListener("visibilitychange", clearIfVisible);
    return () =>
      document.removeEventListener("visibilitychange", clearIfVisible);
  }, [key, trigger]);
};
