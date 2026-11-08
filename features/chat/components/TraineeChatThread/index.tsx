"use client";

import { ChatHeader } from "@/features/chat/components/ChatHeader";
import {
  ChatThread,
  type ChatThreadProps,
} from "@/features/chat/components/ChatThread";
import { FALLBACK_PEER_NAME } from "@/features/chat/constants/messages";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { adminLabel } from "@/features/chat/utils/chat-settings";

export const FALLBACK_PEER_TITLE = FALLBACK_PEER_NAME;

interface TraineeChatThreadProps extends Pick<
  ChatThreadProps,
  | "initial"
  | "userId"
  | "conversationId"
  | "avatars"
  | "jumpToId"
  | "verifiedAdminIds"
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
    infoHref={chatPaths("user", thread.userId).info}
    fallbackPeerName={initialPeerName ?? FALLBACK_PEER_TITLE}
    header={(
      latestPeerName,
      presence,
      { profile, infoHref, peerAvatar, peerVerified },
    ) => (
      <ChatHeader
        name={adminLabel(
          profile.nicknames,
          null,
          latestPeerName ?? initialPeerName ?? FALLBACK_PEER_TITLE,
          "pt",
        )}
        presence={presence}
        avatarSrc={peerAvatar}
        verified={peerVerified}
        infoHref={infoHref}
      />
    )}
  />
);
