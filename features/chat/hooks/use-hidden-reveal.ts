"use client";

import { useEffect, useRef, useState } from "react";

import type { HiddenUser } from "@/features/chat/services/chat-hidden";
import { revealHiddenUsersAction } from "@/features/chat/services/chat-hidden-actions";
import type { InboxItem } from "@/features/chat/services/chat-queries";
import { asPasscodeQuery } from "@/features/chat/utils/inbox-search";

const REVEAL_DEBOUNCE_MS = 300;

export interface RevealedHidden {
  // Every hidden trainee, by name.
  users: HiddenUser[];
  // The ones with a conversation, in inbox shape.
  conversations: InboxItem[];
}

// Reveals the admin's hidden trainees while a search box holds exactly their
// 4-digit passcode (KAN-164, spec Q11/Q12, R3). State only: clearing the
// search, or leaving the page, hides them again. A wrong code looks like any
// other search with no result; the failure is never surfaced. A right code
// also starts the server-side reveal session, so their pages open.
export const useHiddenReveal = (query: string, hasPasscode: boolean) => {
  const [revealed, setRevealed] = useState<RevealedHidden | null>(null);
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
      let next: RevealedHidden | null = null;

      try {
        const result = await revealHiddenUsersAction(code);

        if (result.status === "success" && "users" in result) {
          next = { users: result.users, conversations: result.conversations };
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

  const remove = (userId: number) =>
    setRevealed((current) =>
      current
        ? {
            users: current.users.filter((user) => user.userId !== userId),
            conversations: current.conversations.filter(
              (item) => item.userId !== userId,
            ),
          }
        : null,
    );

  // Derived: no code in the box means nothing is revealed, whatever was kept.
  return { revealed: code === null ? null : revealed, remove };
};
