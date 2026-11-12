import {
  conversationRoom,
  dmRoom,
  INBOX_SUPER_ROOM,
  inboxPtRoom,
  REALTIME_EVENTS,
  userRoom,
} from "@pt/contracts";

import type {
  ChatMessageDeletedEvent,
  ChatMessageEditedEvent,
  ChatMessageSentEvent,
  ChatProfileChangedEvent,
  ChatReactionChangedEvent,
  ChatReadEvent,
  ChatStatusChangedEvent,
  DmMessageDeletedEvent,
  DmReadEvent,
} from "../chat/chat.events.js";

// What one domain event becomes on the sockets. Pure: the emitter performs it.
// Payloads are ids and flags, never message text.
export type Emission = {
  event: string;
  data: object;
  rooms: string[];
  // Admin sockets in the rooms are checked against this trainee's
  // conversation (PT scope, hidden, locked) right before sending.
  guardTraineeUserId?: number;
  // The trainee's sockets join this conversation room first (a conversation
  // that did not exist when they connected).
  joinTraineeUserId?: { userId: number; conversationId: number };
  // Never sent to this socket (the typing sender's own).
  exceptSocketId?: string;
};

export const mapMessageSent = (
  event: ChatMessageSentEvent,
  ptAdminId: number | null,
): Emission[] => [
  {
    event: REALTIME_EVENTS.message,
    data: {
      id: event.messageId,
      conversationId: event.conversationId,
      senderRole: event.senderRole,
      senderAdminId: event.senderAdminId,
      clientId: event.clientId,
    },
    rooms: [conversationRoom(event.conversationId)],
    guardTraineeUserId: event.traineeUserId,
    joinTraineeUserId: {
      userId: event.traineeUserId,
      conversationId: event.conversationId,
    },
  },
  {
    event: REALTIME_EVENTS.inbox,
    data: {
      conversationId: event.conversationId,
      messageId: event.messageId,
      senderRole: event.senderRole,
    },
    // Super admins, and the PT this trainee is assigned to.
    rooms:
      ptAdminId === null
        ? [INBOX_SUPER_ROOM]
        : [INBOX_SUPER_ROOM, inboxPtRoom(ptAdminId)],
    guardTraineeUserId: event.traineeUserId,
  },
];

// Edit, unsend and reaction: ids only, clients fetch ?changedSince=.
export const mapMessageUpdated = (
  event:
    ChatMessageEditedEvent | ChatMessageDeletedEvent | ChatReactionChangedEvent,
): Emission[] => [
  {
    event: REALTIME_EVENTS.messageUpdate,
    data: { conversationId: event.conversationId, messageId: event.messageId },
    rooms: [conversationRoom(event.conversationId)],
    guardTraineeUserId: event.traineeUserId,
  },
];

export const mapRead = (event: ChatReadEvent): Emission[] => [
  {
    event: REALTIME_EVENTS.read,
    data: {
      conversationId: event.conversationId,
      readerKey: event.readerKey,
      lastReadMessageId: event.lastReadMessageId,
    },
    rooms: [conversationRoom(event.conversationId)],
    guardTraineeUserId: event.traineeUserId,
  },
];

export const mapProfileChanged = (
  event: ChatProfileChangedEvent,
): Emission[] => [
  {
    event: REALTIME_EVENTS.profileUpdate,
    data: { conversationId: event.conversationId },
    rooms: [conversationRoom(event.conversationId)],
    guardTraineeUserId: event.traineeUserId,
  },
];

// The trainee, and whoever follows their conversation.
export const mapStatusChanged = (event: ChatStatusChangedEvent): Emission[] => [
  {
    event: REALTIME_EVENTS.chatStatus,
    data: { enabled: event.enabled },
    rooms:
      event.conversationId === null
        ? [userRoom(event.userId)]
        : [userRoom(event.userId), conversationRoom(event.conversationId)],
    guardTraineeUserId: event.userId,
  },
];

export const mapDmDeleted = (event: DmMessageDeletedEvent): Emission[] => [
  {
    event: REALTIME_EVENTS.dmUpdate,
    data: {
      conversationId: event.conversationId,
      messageId: event.messageId,
      senderId: event.senderId,
    },
    rooms: [dmRoom(event.conversationId)],
  },
];

export const mapDmRead = (event: DmReadEvent): Emission[] => [
  {
    event: REALTIME_EVENTS.dmRead,
    data: {
      conversationId: event.conversationId,
      userId: event.userId,
      lastReadMessageId: event.lastReadMessageId,
    },
    rooms: [dmRoom(event.conversationId)],
  },
];
