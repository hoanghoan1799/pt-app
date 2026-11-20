import {
  conversationRoom,
  dmRoom,
  groupRoom,
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
import type {
  GroupMembersChangedEvent,
  GroupMessageSentEvent,
  GroupMessageUpdatedEvent,
  GroupReadEvent,
} from "../chat-groups/group.events.js";

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
  // Every socket in the rooms is checked against this group right before
  // sending (still a member, group not dissolved, session alive; a super
  // admin always; `superAdminsOnly` for the PT-change alert). A socket that
  // fails leaves the group room.
  guardGroup?: { groupId: number; superAdminsOnly: boolean };
  // The sockets of these account rooms join `room` first (added members).
  join?: { accounts: string[]; room: string };
  // Afterwards the sockets of these account rooms leave `room` (removed or
  // left members), or every socket in it when `everyone` (dissolved).
  leave?: { accounts: string[]; room: string; everyone?: boolean };
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

// --- Group chat -------------------------------------------------------------
// Ids only, clients refetch. A group's explicit members hear it through the
// group room; super admins (implicit members of every group) through
// INBOX_SUPER_ROOM. The PT-change alert reaches super admins only. A member
// key ("user:<id>" / "admin:<id>") is also the name of that account's room.

const groupRooms = (groupId: number, superAdminsOnly: boolean) =>
  superAdminsOnly ? [INBOX_SUPER_ROOM] : [groupRoom(groupId), INBOX_SUPER_ROOM];

export const mapGroupMessageSent = (
  event: GroupMessageSentEvent,
): Emission[] => {
  const superAdminsOnly = event.audience !== null;

  return [
    {
      event: REALTIME_EVENTS.groupMessage,
      data: { groupId: event.groupId, messageId: event.messageId },
      rooms: groupRooms(event.groupId, superAdminsOnly),
      guardGroup: { groupId: event.groupId, superAdminsOnly },
    },
  ];
};

// Edit, unsend, reaction, hide and an alert's resolution.
export const mapGroupMessageUpdated = (
  event: GroupMessageUpdatedEvent,
): Emission[] => {
  const superAdminsOnly = event.audience !== null;

  return [
    {
      event: REALTIME_EVENTS.groupMessageUpdate,
      data: { groupId: event.groupId, messageId: event.messageId },
      rooms: groupRooms(event.groupId, superAdminsOnly),
      guardGroup: { groupId: event.groupId, superAdminsOnly },
    },
  ];
};

export const mapGroupRead = (event: GroupReadEvent): Emission[] => [
  {
    event: REALTIME_EVENTS.groupRead,
    data: {
      groupId: event.groupId,
      readerKey: event.readerKey,
      lastReadMessageId: event.lastReadMessageId,
    },
    rooms: groupRooms(event.groupId, false),
    guardGroup: { groupId: event.groupId, superAdminsOnly: false },
  },
];

// Members, name, photo or managers-only changed. Added members' sockets join
// first, removed ones leave after (and never hear it); a dissolve tells the
// members once and empties the room.
export const mapGroupMembersChanged = (
  event: GroupMembersChangedEvent,
): Emission[] => {
  const room = groupRoom(event.groupId);

  return [
    {
      event: REALTIME_EVENTS.groupMembers,
      data: { groupId: event.groupId },
      rooms: groupRooms(event.groupId, false),
      ...(event.dissolved
        ? { leave: { accounts: [], room, everyone: true } }
        : {
            guardGroup: { groupId: event.groupId, superAdminsOnly: false },
            ...(event.joined.length > 0
              ? { join: { accounts: event.joined, room } }
              : {}),
            ...(event.left.length > 0
              ? { leave: { accounts: event.left, room } }
              : {}),
          }),
    },
  ];
};
