"use client";

import { useEffect, useRef, useState } from "react";

import { PRESENCE_HEARTBEAT_MS } from "@/features/chat/utils/presence";
import { BUBBLES_URL } from "@/features/chat-bubbles/constants";
import type { BubbleMeta, BubbleRole } from "@/features/chat-bubbles/types";
import { adminKeyUserId } from "@/features/chat-bubbles/utils/bubble-links";
import type { BubbleAction } from "@/features/chat-bubbles/utils/bubble-store";
import { startVisibleInterval } from "@/utils/visible-interval";

const metaUrl = (role: BubbleRole, keys: readonly string[]) => {
  if (role === "user") {
    return BUBBLES_URL;
  }
  const ids = keys.flatMap((key) => adminKeyUserId(key) ?? []);

  return `${BUBBLES_URL}?as=admin&ids=${ids.join(",")}`;
};

const isMeta = (value: unknown): value is BubbleMeta => {
  const item = value as Partial<BubbleMeta> | null;

  return (
    typeof item?.key === "string" &&
    typeof item.name === "string" &&
    typeof item.href === "string" &&
    typeof item.embedHref === "string" &&
    (item.lastSeenAt === undefined ||
      item.lastSeenAt === null ||
      typeof item.lastSeenAt === "string")
  );
};

// A missing field (older server) counts as never seen.
const withLastSeen = (item: BubbleMeta): BubbleMeta => ({
  ...item,
  lastSeenAt: item.lastSeenAt ?? null,
});

// Name, photo and links of the open bubbles. Each key is fetched once per page
// load (the first fetch refreshes what was stored); a key the server no longer
// returns (hidden, out of scope, chat locked) is closed. While `isLive` (the
// bubble row is expanded) the open keys are refetched every minute, and only
// their last-seen value is merged in.
export const useBubbleMeta = (
  role: BubbleRole,
  keys: readonly string[],
  dispatch: (action: BubbleAction) => void,
  isLive = false,
) => {
  const [metas, setMetas] = useState<Readonly<Record<string, BubbleMeta>>>({});
  const requested = useRef(new Set<string>());
  const signature = keys.join("|");

  useEffect(() => {
    const wanted = signature === "" ? [] : signature.split("|");
    const missing = wanted.filter((key) => !requested.current.has(key));

    if (missing.length === 0) {
      return;
    }
    missing.forEach((key) => requested.current.add(key));
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(metaUrl(role, missing), {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("meta");
        }
        const data: { bubbles?: unknown } = await response.json();
        const found = (Array.isArray(data.bubbles) ? data.bubbles : []).filter(
          (item): item is BubbleMeta =>
            isMeta(item) && missing.includes(item.key),
        );

        if (cancelled) {
          missing.forEach((key) => requested.current.delete(key));
          return;
        }
        setMetas((current) => ({
          ...current,
          ...Object.fromEntries(
            found.map((item) => [item.key, withLastSeen(item)]),
          ),
        }));
        missing
          .filter((key) => !found.some((item) => item.key === key))
          .forEach((key) => dispatch({ type: "close", key }));
      } catch {
        // Offline or a server hiccup: try again on the next change.
        missing.forEach((key) => requested.current.delete(key));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [role, signature, dispatch]);

  useEffect(() => {
    if (!isLive || signature === "") {
      return;
    }
    const wanted = signature.split("|");
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(metaUrl(role, wanted), {
          cache: "no-store",
        });

        if (!response.ok || cancelled) {
          return;
        }
        const data: { bubbles?: unknown } = await response.json();
        const fresh = new Map(
          (Array.isArray(data.bubbles) ? data.bubbles : [])
            .filter(
              (item): item is BubbleMeta =>
                isMeta(item) && wanted.includes(item.key),
            )
            .map((item) => [item.key, item.lastSeenAt ?? null] as const),
        );

        if (cancelled) {
          return;
        }
        setMetas((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, meta]) => [
              key,
              fresh.has(key)
                ? { ...meta, lastSeenAt: fresh.get(key) ?? null }
                : meta,
            ]),
          ),
        );
      } catch {
        // The next beat retries.
      }
    };
    const stop = startVisibleInterval(
      () => void refresh(),
      PRESENCE_HEARTBEAT_MS,
    );

    return () => {
      cancelled = true;
      stop();
    };
  }, [isLive, role, signature]);

  return metas;
};
