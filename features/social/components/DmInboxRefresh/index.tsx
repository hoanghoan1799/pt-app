"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { startVisibleInterval } from "@/utils/visible-interval";

// router.refresh() re-renders the whole server tree, so keep it slow.
export const DM_INBOX_REFRESH_MS = 30_000;

// Keeps the inbox fresh while it is open: refetches the server data every 30 s
// while the tab is visible, and once when the tab comes back to the front.
export const DmInboxRefresh = () => {
  const router = useRouter();

  useEffect(
    () => startVisibleInterval(() => router.refresh(), DM_INBOX_REFRESH_MS),
    [router],
  );

  return null;
};
