"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { ROUTES } from "@/constants/routes";
import { shouldLockAfterHidden } from "@/features/auth/utils/background-lock";
import { buildLockUrl } from "@/features/auth/utils/lock-redirect";

// Sends an admin with a passcode to the lock screen when the app comes back
// after being hidden for the whole unlock window.
export const useBackgroundLock = (isEnabled: boolean) => {
  const router = useRouter();
  const pathname = usePathname();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isEnabled || pathname.startsWith(ROUTES.ADMIN_LOCK)) {
      return;
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const wasHiddenAt = hiddenAt.current;

      hiddenAt.current = null;
      if (shouldLockAfterHidden(wasHiddenAt, Date.now())) {
        router.replace(
          buildLockUrl(`${window.location.pathname}${window.location.search}`),
        );
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isEnabled, pathname, router]);
};
