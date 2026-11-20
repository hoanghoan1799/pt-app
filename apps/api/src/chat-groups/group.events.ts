// Domain events of group chat, emitted (through ChatEvents) after the change
// is committed. The realtime gateway and web push listen; group chat never
// imports a sender. Payloads are ids and flags; `body` rides on
// `groupMessageSent` only so the push listener can build its preview (never
// log it).

export const GROUP_EVENTS = {
  // A new message or system line. `audience` "super_admin" = the PT-change
  // alert, for super admins only.
  messageSent: "chat_group.message.sent",
  // Edit, unsend, reaction, hide, alert resolution.
  messageUpdated: "chat_group.message.updated",
  read: "chat_group.read",
  // Members, name, photo, managers-only or dissolve changed. `joined` and
  // `left` are the member keys whose sockets join or leave the group room.
  membersChanged: "chat_group.members.changed",
} as const;

export type GroupMessageSentEvent = {
  groupId: number;
  messageId: number;
  kind: "message" | "system";
  audience: "super_admin" | null;
  // Push facts; only for a new, non-silent message (system lines push
  // nobody).
  push: {
    senderKey: string;
    body: string;
    sticker: boolean;
    photoCount: number;
  } | null;
};

export type GroupMessageUpdatedEvent = {
  groupId: number;
  messageId: number;
  audience: "super_admin" | null;
};

export type GroupReadEvent = {
  groupId: number;
  readerKey: string;
  lastReadMessageId: number;
};

export type GroupMembersChangedEvent = {
  groupId: number;
  joined: string[];
  left: string[];
  // Dissolved: every explicit member's sockets leave the room.
  dissolved: boolean;
};
