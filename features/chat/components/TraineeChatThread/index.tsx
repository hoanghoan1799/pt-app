"use client";

import { AppHeader } from "@/components/layout/AppHeader";
import { UserHeaderActions } from "@/features/auth/components/UserHeaderActions";
import {
  ChatThread,
  type ChatThreadProps,
} from "@/features/chat/components/ChatThread";

export const FALLBACK_PEER_TITLE = "PT của bạn";

interface TraineeChatThreadProps extends Pick<
  ChatThreadProps,
  "initial" | "userId" | "conversationId"
> {
  // Username of the PT who wrote last, from the server; the live thread
  // takes over once a newer PT message arrives.
  initialPeerName: string | null;
}

// The trainee's thread. A client component because the header follows the
// loaded messages (a function prop cannot cross from a server page). The
// account actions match the other trainee tabs.
export const TraineeChatThread = ({
  initialPeerName,
  ...thread
}: TraineeChatThreadProps) => (
  <ChatThread
    {...thread}
    header={(latestPeerName) => (
      <AppHeader
        eyebrow="Nhắn tin với"
        title={latestPeerName ?? initialPeerName ?? FALLBACK_PEER_TITLE}
        actions={<UserHeaderActions />}
      />
    )}
  />
);
