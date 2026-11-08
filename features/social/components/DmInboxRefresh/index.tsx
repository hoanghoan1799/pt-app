"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DM_POLL_MS } from "@/features/social/constants/dm";

// Keeps the inbox fresh while it is open: refetches the server data every few
// seconds and when the tab comes back to the front.
export const DmInboxRefresh = () => {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const timer = setInterval(refresh, DM_POLL_MS * 3);

    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
};
