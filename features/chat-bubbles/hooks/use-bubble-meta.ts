"use client";

import { useEffect, useRef, useState } from "react";

import { BUBBLES_URL } from "@/features/chat-bubbles/constants";
import type { BubbleMeta, BubbleRole } from "@/features/chat-bubbles/types";
import { adminKeyUserId } from "@/features/chat-bubbles/utils/bubble-links";
import type { BubbleAction } from "@/features/chat-bubbles/utils/bubble-store";

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
    typeof item.embedHref === "string"
  );
};

// Name, photo and links of the open bubbles. Each key is fetched once per page
// load (the first fetch refreshes what was stored); a key the server no longer
// returns (hidden, out of scope, chat locked) is closed.
export const useBubbleMeta = (
  role: BubbleRole,
  keys: readonly string[],
  dispatch: (action: BubbleAction) => void,
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
          ...Object.fromEntries(found.map((item) => [item.key, item])),
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

  return metas;
};
