"use client";

import { useTranslations } from "next-intl";

import { ChatHeader } from "@/features/chat/components/ChatHeader";
import {
  ChatThread,
  type ChatThreadProps,
} from "@/features/chat/components/ChatThread";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { adminLabel } from "@/features/chat/utils/chat-settings";
import { bubbleKeyFor } from "@/features/chat-bubbles/utils/bubble-links";

interface TraineeChatThreadProps extends Pick<
  ChatThreadProps,
  | "initial"
  | "userId"
  | "conversationId"
  | "avatars"
  | "jumpToId"
  | "verifiedAdminIds"
  | "replyPost"
  | "isEmbed"
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
}: TraineeChatThreadProps) => {
  const t = useTranslations("chat.shared");

  return (
    <ChatThread
      {...thread}
      infoHref={chatPaths("user", thread.userId).info}
      fallbackPeerName={initialPeerName ?? t("fallbackPeer")}
      header={(
        latestPeerName,
        presence,
        { profile, infoHref, peerAvatar, peerVerified },
      ) => (
        <ChatHeader
          name={adminLabel(
            profile.nicknames,
            null,
            latestPeerName ?? initialPeerName ?? t("fallbackPeer"),
            "pt",
          )}
          presence={presence}
          avatarSrc={peerAvatar}
          verified={peerVerified}
          infoHref={infoHref}
          bubble={{ role: "user", key: bubbleKeyFor("user", thread.userId) }}
        />
      )}
    />
  );
};
