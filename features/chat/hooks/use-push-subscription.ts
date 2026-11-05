"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPushOptInState,
  type PushOptInState,
  urlBase64ToUint8Array,
} from "@/features/chat/utils/push-support";
import { detectInstallPlatform } from "@/features/pwa/utils/detect-install-platform";

export type PushRole = "user" | "admin";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DISMISS_KEY_PREFIX = "pt-push-optin-dismissed:";
const ERROR_MESSAGE = "Không bật được thông báo. Vui lòng thử lại.";

// Browsers that already subscribed re-register once per page session so the
// server row exists for whoever is signed in now.
const resyncedRoles = new Set<PushRole>();

interface Environment {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  standalone: boolean;
  isIos: boolean;
}

const subscribeUrl = (role: PushRole) =>
  role === "admin" ? "/api/push/subscribe?as=admin" : "/api/push/subscribe";

const deleteSubscription = async (role: PushRole, endpoint: string) => {
  const response = await fetch(subscribeUrl(role), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });

  if (!response.ok) {
    throw new Error(`unsubscribe failed: ${response.status}`);
  }
};

const readDismissed = (role: PushRole) => {
  try {
    return window.localStorage.getItem(DISMISS_KEY_PREFIX + role) === "1";
  } catch {
    return false;
  }
};

const writeDismissed = (role: PushRole) => {
  try {
    window.localStorage.setItem(DISMISS_KEY_PREFIX + role, "1");
  } catch {
    // Private mode: the card just shows again next visit.
  }
};

const readEnvironment = (): Environment => {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true;
  const platform = detectInstallPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    isStandalone: false,
  });
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  return {
    supported,
    permission:
      "Notification" in window ? Notification.permission : "unsupported",
    standalone,
    isIos: platform === "ios",
  };
};

const postSubscription = async (role: PushRole, json: unknown) => {
  const response = await fetch(subscribeUrl(role), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });

  if (!response.ok) {
    throw new Error(`subscribe failed: ${response.status}`);
  }
};

export const usePushSubscription = (role: PushRole) => {
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const env = readEnvironment();

    // Browser-only values are read after mount so the server render and the
    // first client render match (the card renders nothing until then).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnvironment(env);
    setDismissed(readDismissed(role));
    if (!VAPID_PUBLIC_KEY || !env.supported) {
      return;
    }
    let cancelled = false;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (existing) => {
        if (cancelled || !existing) {
          return;
        }
        setSubscribed(true);
        if (!resyncedRoles.has(role)) {
          resyncedRoles.add(role);
          await postSubscription(role, existing.toJSON()).catch(() => {
            // Retried on the next page session.
            resyncedRoles.delete(role);
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [role]);

  const state: PushOptInState = environment
    ? getPushOptInState({
        ...environment,
        dismissed,
        subscribed,
        hasVapidKey: VAPID_PUBLIC_KEY.length > 0,
      })
    : "hidden";

  const dismiss = useCallback(() => {
    writeDismissed(role);
    setDismissed(true);
  }, [role]);

  // requestPermission must run straight from the tap (iOS drops it otherwise),
  // so nothing is awaited before it.
  const enable = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setEnvironment((current) =>
          current ? { ...current, permission } : current,
        );
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      await postSubscription(role, subscription.toJSON());
      resyncedRoles.add(role);
      setSubscribed(true);
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [role]);

  // Turns push off for this browser: drops the server row, then the browser
  // subscription, so no message can reach it any more.
  const disable = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        await deleteSubscription(role, existing.endpoint);
        await existing.unsubscribe();
      }
      resyncedRoles.delete(role);
      setSubscribed(false);
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [role]);

  // What the settings menu needs, independent of the one-time card's
  // "Để sau": whether push can work here at all, and whether it is on.
  const isReady = environment !== null;
  const isAvailable =
    isReady &&
    VAPID_PUBLIC_KEY.length > 0 &&
    (environment.supported || (environment.isIos && !environment.standalone));
  const needsInstall =
    isAvailable && environment.isIos && !environment.standalone;
  const isBlocked = isAvailable && environment.permission === "denied";

  return {
    state,
    busy,
    error,
    enable,
    dismiss,
    disable,
    isReady,
    isAvailable,
    needsInstall,
    isBlocked,
    isSubscribed: subscribed,
  };
};
