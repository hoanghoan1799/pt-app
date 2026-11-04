"use client";

import { useMemo } from "react";

import type { ChatAdapter } from "@/features/chat/hooks/use-chat-messages";
import {
  adminMarkReadAction,
  adminSendMessageAction,
  markReadAction,
  sendMessageAction,
} from "@/features/chat/services/chat-actions";
import type { ThreadViewer } from "@/features/chat/utils/chat-thread-rules";

const USER_MESSAGES_URL = "/api/chat/messages";

// Wires the thread to the trainee or the admin endpoints and actions. Server
// actions cannot be passed down from a server page as plain props with extra
// arguments, so the adapter is built here from serializable inputs.
export const useChatAdapter = (
  viewer: ThreadViewer,
  userId: number,
  conversationId: number | null,
): ChatAdapter => {
  const role = viewer.role;
  const adminId = viewer.role === "admin" ? viewer.adminId : null;
  const adminName = viewer.role === "admin" ? viewer.adminName : null;
  const peerName = viewer.role === "admin" ? viewer.peerName : null;

  return useMemo<ChatAdapter>(() => {
    if (role === "admin" && adminId !== null && adminName !== null) {
      return {
        messagesUrl: `/api/admin/chat/${conversationId ?? 0}/messages`,
        viewer: { role, adminId, adminName, peerName },
        sendMessage: (body, clientId) =>
          adminSendMessageAction({ userId, body, clientId }),
        markRead: (lastReadMessageId) =>
          adminMarkReadAction({
            conversationId: conversationId ?? 0,
            lastReadMessageId,
          }),
      };
    }
    return {
      messagesUrl: USER_MESSAGES_URL,
      viewer: { role: "user" },
      sendMessage: (body, clientId) => sendMessageAction({ body, clientId }),
      markRead: (lastReadMessageId) => markReadAction({ lastReadMessageId }),
    };
  }, [role, adminId, adminName, peerName, userId, conversationId]);
};
