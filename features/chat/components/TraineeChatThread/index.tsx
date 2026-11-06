"use client";

import { ChatHeader } from "@/features/chat/components/ChatHeader";
import {
  ChatThread,
  type ChatThreadProps,
} from "@/features/chat/components/ChatThread";
import { adminLabel } from "@/features/chat/utils/chat-settings";

export const FALLBACK_PEER_TITLE = "PT của bạn";

interface TraineeChatThreadProps extends Pick<
  ChatThreadProps,
  "initial" | "userId" | "conversationId" | "avatars" | "selfAvatarUrl"
> {
  // Username of the PT who wrote last, from the server; the live thread
  // takes over once a newer PT message arrives.
  initialPeerName: string | null;
  // The trainee's real name for the settings sheet.
  userName: string;
}

// The trainee's thread. A client component because the header follows the
// loaded messages and the live presence (a function prop cannot cross from a
// server page).
export const TraineeChatThread = ({
  initialPeerName,
  userName,
  ...thread
}: TraineeChatThreadProps) => (
  <ChatThread
    {...thread}
    selfName={userName}
    fallbackPeerName={initialPeerName ?? FALLBACK_PEER_TITLE}
    header={(
      latestPeerName,
      presence,
      { profile, openSettings, peerAvatar },
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
        onOpenSettings={openSettings}
      />
    )}
  />
);
