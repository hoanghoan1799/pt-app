"use client";

import { useEffect } from "react";

import { NAVIGATE_MESSAGE } from "@/features/chat-bubbles/constants";
import { useIsEmbedded } from "@/features/chat-bubbles/hooks/use-is-embedded";
import { isLeavingChat } from "@/features/chat-bubbles/utils/bubble-links";

// Inside the bubble panel's iframe: a link that leaves the chat is handed to
// the parent window (which navigates and folds the panel), and a link to
// another site opens in a new tab instead of replacing the chat.
export const EmbedBridge = () => {
  const isEmbedded = useIsEmbedded();

  useEffect(() => {
    if (!isEmbedded) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;

      if (
        !anchor ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      const { origin, pathname } = window.location;

      if (isLeavingChat(anchor.href, pathname, origin)) {
        event.preventDefault();
        event.stopPropagation();
        const url = new URL(anchor.href);

        window.parent.postMessage(
          {
            type: NAVIGATE_MESSAGE,
            href: `${url.pathname}${url.search}${url.hash}`,
          },
          origin,
        );
      } else if (new URL(anchor.href, origin).origin !== origin) {
        event.preventDefault();
        event.stopPropagation();
        window.open(anchor.href, "_blank", "noopener,noreferrer");
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isEmbedded]);

  return null;
};
