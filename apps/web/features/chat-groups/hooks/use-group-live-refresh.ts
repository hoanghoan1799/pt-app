"use client";

import { REALTIME_EVENTS } from "@pt/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  type ChatRole,
  groupIdOf,
  subscribeChatSocket,
} from "@/features/chat/hooks/chat-socket";

// Several member events in a burst (an add of five) become one refresh.
const COALESCE_MS = 300;

// Whether a socket event changes the info page of `groupId`: members, name,
// photo, managers-only and dissolve all come as `group:members` (ids only).
export const refreshesGroupInfo = (
  name: string,
  data: unknown,
  groupId: number,
) => name === REALTIME_EVENTS.groupMembers && groupIdOf(data) === groupId;

// Keeps a server-rendered group info page fresh over the shared socket: a
// change by another manager refreshes the route (and a member who lost access
// lands on the 404 at their next navigation). Reconnects catch up once.
export const useGroupLiveRefresh = (role: ChatRole, groupId: number) => {
  const router = useRouter();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (pending.current === null) {
        pending.current = setTimeout(() => {
          pending.current = null;
          router.refresh();
        }, COALESCE_MS);
      }
    };
    let isFirstConnect = true;
    const unsubscribe = subscribeChatSocket(role, {
      onConnect: () => {
        // The page was just rendered: only a reconnect has a gap to fill.
        if (!isFirstConnect) {
          refresh();
        }
        isFirstConnect = false;
      },
      onEvent: (name, data) => {
        if (refreshesGroupInfo(name, data, groupId)) {
          refresh();
        }
      },
    });

    return () => {
      unsubscribe();
      if (pending.current !== null) {
        clearTimeout(pending.current);
        pending.current = null;
      }
    };
  }, [role, groupId, router]);
};
