"use client";

import { useEffect, useRef, useState } from "react";

import { revealHiddenConversationsAction } from "@/features/chat/services/chat-hidden-actions";
import type { InboxItem } from "@/features/chat/services/chat-queries";
import { asPasscodeQuery } from "@/features/chat/utils/inbox-search";

const REVEAL_DEBOUNCE_MS = 300;

// Reveals the admin's hidden chats while the search box holds exactly their
// 4-digit passcode (KAN-164, spec Q11/Q12). State only: clearing the search,
// or leaving the page, hides them again. A wrong code looks like any other
// search with no result; the failure is never surfaced.
export const useHiddenReveal = (query: string, hasPasscode: boolean) => {
  const [revealed, setRevealed] = useState<InboxItem[] | null>(null);
  const requested = useRef<string | null>(null);
  const code = hasPasscode ? asPasscodeQuery(query) : null;

  useEffect(() => {
    if (code === null) {
      requested.current = null;
      return;
    }
    if (requested.current === code) {
      return;
    }
    let isDone = false;
    const timer = setTimeout(async () => {
      requested.current = code;
      let next: InboxItem[] | null = null;

      try {
        const result = await revealHiddenConversationsAction(code);

        if (result.status === "success" && "conversations" in result) {
          next = result.conversations;
        }
      } catch {
        next = null;
      }
      isDone = true;
      setRevealed((current) => (requested.current === code ? next : current));
    }, REVEAL_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // Interrupted before the answer arrived: allow asking again.
      if (!isDone && requested.current === code) {
        requested.current = null;
      }
    };
  }, [code]);

  const remove = (conversationId: number) =>
    setRevealed(
      (current) =>
        current?.filter((item) => item.conversationId !== conversationId) ??
        null,
    );

  // Derived: no code in the box means nothing is revealed, whatever was kept.
  return { revealed: code === null ? null : revealed, remove };
};
