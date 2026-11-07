"use client";

import type { ReactNode } from "react";

import { ROUTES } from "@/constants/routes";
import { ChatHeader } from "@/features/chat/components/ChatHeader";
import {
  ChatThread,
  type ChatThreadProps,
} from "@/features/chat/components/ChatThread";
import { chatPaths } from "@/features/chat/utils/chat-links";
import { displayNameFor } from "@/features/chat/utils/display-name";

interface AdminChatThreadProps extends Pick<
  ChatThreadProps,
  | "initial"
  | "userId"
  | "conversationId"
  | "jumpToId"
  | "viewer"
  | "emptyText"
  | "ariaLabel"
  | "avatars"
> {
  // The trainee's real name; the admin's nickname for them wins in the title.
  userName: string;
  // Server-rendered rows under the header (section tabs, lock switch).
  below: ReactNode;
}

export const SETTINGS_LABEL = "Thông tin cuộc trò chuyện";

// The admin conversation screen. A client component because the title follows
// the nickname and the status follows the live presence (a function prop
// cannot cross from a server page).
export const AdminChatThread = ({
  userName,
  below,
  ...thread
}: AdminChatThreadProps) => (
  <ChatThread
    {...thread}
    infoHref={chatPaths("admin", thread.userId).info}
    header={(_latestPeerName, presence, { profile, infoHref, peerAvatar }) => {
      const name = displayNameFor(profile.nicknames, "user", userName);

      return (
        <>
          <ChatHeader
            name={name}
            title={`Nhắn tin với ${name}`}
            backHref={ROUTES.ADMIN_MESSAGES}
            settingsLabel={SETTINGS_LABEL}
            presence={presence}
            avatarSrc={peerAvatar}
            infoHref={infoHref}
          />
          {below}
        </>
      );
    }}
  />
);
