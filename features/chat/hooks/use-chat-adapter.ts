"use client";

import { useMemo } from "react";

import type {
  ChatAdapter,
  SendContent,
} from "@/features/chat/hooks/use-chat-messages";
import {
  adminMarkReadAction,
  adminSendMessageAction,
  editMessageAction,
  markReadAction,
  reactMessageAction,
  sendMessageAction,
  unsendMessageAction,
} from "@/features/chat/services/chat-actions";
import {
  adminEditMessageAction,
  adminReactMessageAction,
  adminUnsendMessageAction,
} from "@/features/chat/services/chat-admin-actions";
import type { ThreadViewer } from "@/features/chat/utils/chat-thread-rules";

const USER_MESSAGES_URL = "/api/chat/messages";

// The action input for a text or a sticker send.
const contentInput = (content: SendContent) =>
  "sticker" in content ? { sticker: content.sticker.input } : content;

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
      const cid = conversationId ?? 0;

      return {
        messagesUrl: `/api/admin/chat/${cid}/messages`,
        editsUrl: (messageId) =>
          `/api/admin/chat/${cid}/messages/${messageId}/edits`,
        viewer: { role, adminId, adminName, peerName },
        sendMessage: (content, clientId, replyToMessageId) =>
          adminSendMessageAction({
            userId,
            ...contentInput(content),
            clientId,
            replyToMessageId,
          }),
        reactMessage: (messageId, emoji) =>
          adminReactMessageAction({ conversationId: cid, messageId, emoji }),
        editMessage: (messageId, body) =>
          adminEditMessageAction({ conversationId: cid, messageId, body }),
        unsendMessage: (messageId) =>
          adminUnsendMessageAction({ conversationId: cid, messageId }),
        markRead: (lastReadMessageId) =>
          adminMarkReadAction({
            conversationId: cid,
            lastReadMessageId,
          }),
      };
    }
    return {
      messagesUrl: USER_MESSAGES_URL,
      editsUrl: (messageId) => `${USER_MESSAGES_URL}/${messageId}/edits`,
      viewer: { role: "user" },
      sendMessage: (content, clientId, replyToMessageId) =>
        sendMessageAction({
          ...contentInput(content),
          clientId,
          replyToMessageId,
        }),
      reactMessage: (messageId, emoji) =>
        reactMessageAction({ messageId, emoji }),
      editMessage: (messageId, body) => editMessageAction({ messageId, body }),
      unsendMessage: (messageId) => unsendMessageAction({ messageId }),
      markRead: (lastReadMessageId) => markReadAction({ lastReadMessageId }),
    };
  }, [role, adminId, adminName, peerName, userId, conversationId]);
};
