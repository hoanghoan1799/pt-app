"use client";

import { ChatHeader } from "@/features/chat/components/ChatHeader";
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
// loaded messages and the live presence (a function prop cannot cross from a
// server page).
export const TraineeChatThread = ({
  initialPeerName,
  ...thread
}: TraineeChatThreadProps) => (
  <ChatThread
    {...thread}
    header={(latestPeerName, presence) => (
      <ChatHeader
        name={latestPeerName ?? initialPeerName ?? FALLBACK_PEER_TITLE}
        presence={presence}
      />
    )}
  />
);
