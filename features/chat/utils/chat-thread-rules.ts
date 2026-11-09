import { TIME_ZONE } from "@/constants/time";
import {
  adminReaderKey,
  CHAT_REACTION_EMOJIS,
  toReplySnippet,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";
import { adminLabel } from "@/features/chat/utils/chat-settings";
import { displayNameFor } from "@/features/chat/utils/display-name";
import {
  type ChatPhoto,
  PHOTO_QUOTE_TEXT,
} from "@/features/chat/utils/photo-rules";
import type { ChatSticker } from "@/features/chat/utils/sticker-rules";
import type { DmReplyPostView } from "@/features/social/types/dm";

// Pure helpers behind the trainee chat thread: merging, grouping, separators
// and the polling schedule. No React, no network, so every rule is testable.

// A message as the browser holds it: createdAt is the ISO string from JSON.
export interface SerializedChatMessage {
  id: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  senderAdminName: string | null;
  body: string;
  // KAN-144: set for a sticker message (body is empty).
  sticker?: ChatSticker | null;
  // KAN-160: set for a photo message (body is the optional caption).
  photo?: ChatPhoto | null;
  clientId: string;
  createdAt: string;
  replyTo: SerializedReplyTo | null;
  // The social post this message replies to, as the viewer may see it.
  post?: DmReplyPostView | null;
  // ISO string of the last edit, null if never edited.
  editedAt: string | null;
  // Unsent for everyone: body is empty, no reactions, no quote.
  deleted: boolean;
  updatedAt: string;
  reactions: SerializedReaction[];
}

export interface SerializedReaction {
  emoji: string;
  // "user" or "admin:<id>".
  reactorKey: string;
  reactorName: string;
}

export interface SerializedReplyTo {
  id: number;
  // Truncated snippet; empty when the original was unsent.
  body: string;
  // The quoted message is a sticker: the UI shows "Sticker".
  isSticker?: boolean;
  // The quoted message is a photo: the UI shows "Ảnh" when it has no text.
  isPhoto?: boolean;
  senderRole: "user" | "admin";
  deleted: boolean;
}

// `sent` = stored on the server; `sending` / `failed` = optimistic own bubble
// (id is null until the server confirms it).
export type DeliveryState = "sent" | "sending" | "failed";

export interface ThreadMessage extends Omit<SerializedChatMessage, "id"> {
  id: number | null;
  delivery: DeliveryState;
}

// A time stamp appears after a pause longer than this (exactly 30:00 does not
// break the run, 30:01 does).
export const GROUP_GAP_MS = 30 * 60 * 1000;
export const NEAR_BOTTOM_PX = 120;

export const POLL_INTERVAL_MS = {
  // No realtime channel at all (no key, locked, or Ably failed).
  POLLING_ONLY: 3000,
  // Ably configured but suspended/disconnected: keep it slow, it is a backup.
  DEGRADED: 5000,
} as const;

export const toThreadMessage = (
  message: SerializedChatMessage,
): ThreadMessage => ({ ...message, delivery: "sent" });

const compareThread = (a: ThreadMessage, b: ThreadMessage) => {
  if (a.id !== null && b.id !== null) {
    return a.id - b.id;
  }
  if (a.id === null && b.id === null) {
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  }
  // Unconfirmed bubbles always sit below stored messages.
  return a.id === null ? 1 : -1;
};

// Folds server messages into the current list. A stored message replaces the
// optimistic bubble with the same clientId; the same id never appears twice;
// the result is stored messages by id, then pending ones by send time.
export const mergeMessages = (
  current: ThreadMessage[],
  incoming: SerializedChatMessage[],
): ThreadMessage[] => {
  const byId = new Map<number, ThreadMessage>();
  const pending = new Map<string, ThreadMessage>();

  for (const message of current) {
    if (message.id === null) {
      pending.set(message.clientId, message);
    } else {
      byId.set(message.id, message);
    }
  }
  for (const message of incoming) {
    byId.set(message.id, toThreadMessage(message));
    pending.delete(message.clientId);
  }
  return [...byId.values(), ...pending.values()].sort(compareThread);
};

// Folds changed messages (edit, unsend, reaction) into the list: a stored
// message with the same id is replaced in place. An id that is not loaded
// (older than the page, or not fetched yet) is skipped: adding it would leave a
// gap, and newer ones arrive through the `after` fetch.
export const mergeChanges = (
  current: ThreadMessage[],
  changes: SerializedChatMessage[],
): ThreadMessage[] => {
  if (changes.length === 0) {
    return current;
  }
  const byId = new Map<number, SerializedChatMessage>();

  for (const change of changes) {
    byId.set(change.id, change);
  }
  return current.map((message) => {
    const change = message.id === null ? undefined : byId.get(message.id);

    return change ? toThreadMessage(change) : message;
  });
};

export const lastStoredId = (messages: ThreadMessage[]) => {
  let last = 0;

  for (const message of messages) {
    if (message.id !== null && message.id > last) {
      last = message.id;
    }
  }
  return last;
};

export const firstStoredId = (messages: ThreadMessage[]) => {
  for (const message of messages) {
    if (message.id !== null) {
      return message.id;
    }
  }
  return null;
};

// Who is looking at the thread. The admin carries the names the bubbles need:
// the trainee's (avatar) and their own (optimistic bubbles).
export type ThreadViewer =
  | { role: "user" }
  | {
      role: "admin";
      adminId: number;
      adminName: string;
      peerName: string | null;
    };

export const USER_VIEWER: ThreadViewer = { role: "user" };

// Newest message from the other side: what "read" is reported against. For a
// trainee that is the PT, for an admin the trainee.
export const newestPeerMessageId = (
  messages: ThreadMessage[],
  viewerRole: ThreadViewer["role"] = "user",
) => {
  const peerRole = viewerRole === "user" ? "admin" : "user";
  let newest = 0;

  for (const message of messages) {
    if (
      message.senderRole === peerRole &&
      message.id !== null &&
      message.id > newest
    ) {
      newest = message.id;
    }
  }
  return newest;
};

// Username of the admin who wrote the newest stored admin message, or null
// when there is none or that admin was deleted. Names the PT in the trainee's
// header.
export const latestAdminName = (messages: ThreadMessage[]) => {
  let newest: ThreadMessage | null = null;

  for (const message of messages) {
    if (
      message.senderRole === "admin" &&
      message.id !== null &&
      (newest === null || message.id > (newest.id ?? 0))
    ) {
      newest = message;
    }
  }
  return newest?.senderAdminName ?? null;
};

// Id of the PT who wrote last (for their photo); null if none.
export const latestAdminId = (
  messages: Pick<ThreadMessage, "senderRole" | "senderAdminId">[],
): number | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.senderRole === "admin" && message.senderAdminId !== null) {
      return message.senderAdminId;
    }
  }
  return null;
};

// The read cursor is sent only when it moves forward.
export const shouldMarkRead = (newestPeerId: number, lastMarkedId: number) =>
  newestPeerId > lastMarkedId;

export type RealtimeState =
  "unavailable" | "connecting" | "connected" | "degraded";

// How often to poll, or null for "do not poll". A hidden tab never polls (it
// fetches once on becoming visible); a healthy Ably connection needs no poll.
export const pollIntervalFor = (
  state: RealtimeState,
  isHidden: boolean,
): number | null => {
  if (isHidden || state === "connected") {
    return null;
  }
  return state === "degraded"
    ? POLL_INTERVAL_MS.DEGRADED
    : POLL_INTERVAL_MS.POLLING_ONLY;
};

// Maps an Ably connection state name to ours.
export const realtimeStateFor = (ablyState: string): RealtimeState => {
  switch (ablyState) {
    case "connected":
      return "connected";
    case "suspended":
    case "disconnected":
    case "failed":
      return "degraded";
    case "closed":
      return "unavailable";
    default:
      return "connecting";
  }
};

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// yyyy-mm-dd in the app time zone.
export const dayKey = (value: number | string) =>
  dayFormatter.format(new Date(value));

export const formatTime = (iso: string) => timeFormatter.format(new Date(iso));

const DAY_MS = 24 * 60 * 60 * 1000;

export const dayLabel = (iso: string, nowMs: number) => {
  const key = dayKey(iso);

  if (key === dayKey(nowMs)) {
    return "Hôm nay";
  }
  if (key === dayKey(nowMs - DAY_MS)) {
    return "Hôm qua";
  }
  const [, month, day] = key.split("-");

  return `${day}/${month}`;
};

export type ThreadItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "time"; key: string; label: string }
  | {
      kind: "message";
      key: string;
      message: ThreadMessage;
      mine: boolean;
      // First / last bubble of a run from the same sender.
      isFirstInRun: boolean;
      isLastInRun: boolean;
      // Name above the first bubble of a run: the PT for a trainee, another
      // admin for an admin. Never on my own runs.
      senderName: string | null;
      showAvatar: boolean;
      // Whose initials the round avatar shows (the other side).
      avatarName: string | null;
      // "Đã gửi" / "Đã xem", only under my newest stored message.
      statusLine: string | null;
    };

export const PEER_DELETED_NAME = "PT (đã xoá)";

const senderKey = (message: ThreadMessage) =>
  message.senderRole === "user" ? "user" : `admin:${message.senderAdminId}`;

const senderNameFor = (
  message: ThreadMessage,
  viewer: ThreadViewer,
  continuesRun: boolean,
  nicknames: Readonly<Record<string, string>>,
) => {
  if (continuesRun) {
    return null;
  }
  if (viewer.role === "user") {
    return message.senderRole === "admin"
      ? message.senderAdminName === null
        ? PEER_DELETED_NAME
        : adminLabel(
            nicknames,
            message.senderAdminId,
            message.senderAdminName,
            "pt",
          )
      : null;
  }
  // Admin viewer: the trainee needs no label, my own runs neither; a
  // colleague's run is named (a deleted account has no id or name left).
  return message.senderRole === "admin" &&
    message.senderAdminId !== viewer.adminId
    ? message.senderAdminName === null
      ? PEER_DELETED_NAME
      : adminLabel(nicknames, message.senderAdminId, message.senderAdminName)
    : null;
};

// Turns the message list into render items: day separators, centred time
// stamps after a 15 minute gap, and run grouping (names, avatars, spacing).
export const buildThreadItems = (
  messages: ThreadMessage[],
  peerReadUpTo: number,
  nowMs: number,
  viewer: ThreadViewer = USER_VIEWER,
  nicknames: Readonly<Record<string, string>> = {},
): ThreadItem[] => {
  // "Mine" is the right-hand side: the trainee's own messages, or for an
  // admin every admin message (the PT inbox is shared, D4).
  const isMine = (message: ThreadMessage) => message.senderRole === viewer.role;
  const items: ThreadItem[] = [];
  // Index in `items` of the previous message, reset by any separator.
  let previousIndex = -1;
  let lastMineStoredId: number | null = null;

  for (const message of messages) {
    if (isMine(message) && message.id !== null) {
      lastMineStoredId = message.id;
    }
  }

  messages.forEach((message, index) => {
    const previous = index > 0 ? messages[index - 1] : null;
    const key = message.id === null ? message.clientId : String(message.id);
    let separated = false;

    if (!previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)) {
      items.push({
        kind: "day",
        key: `day-${key}`,
        label: dayLabel(message.createdAt, nowMs),
      });
      separated = true;
    } else if (
      Date.parse(message.createdAt) - Date.parse(previous.createdAt) >
      GROUP_GAP_MS
    ) {
      items.push({
        kind: "time",
        key: `time-${key}`,
        label: formatTime(message.createdAt),
      });
      separated = true;
    }
    if (separated) {
      previousIndex = -1;
    }
    const mine = isMine(message);
    const continuesRun =
      previousIndex >= 0 &&
      previous &&
      senderKey(previous) === senderKey(message);
    const next = messages[index + 1];
    const nextContinues =
      next !== undefined &&
      senderKey(next) === senderKey(message) &&
      dayKey(next.createdAt) === dayKey(message.createdAt) &&
      Date.parse(next.createdAt) - Date.parse(message.createdAt) <=
        GROUP_GAP_MS;
    const isLastInRun = !nextContinues;

    items.push({
      kind: "message",
      key,
      message,
      mine,
      isFirstInRun: !continuesRun,
      isLastInRun,
      senderName: senderNameFor(
        message,
        viewer,
        Boolean(continuesRun),
        nicknames,
      ),
      showAvatar: !mine && isLastInRun,
      avatarName:
        viewer.role === "admin"
          ? viewer.peerName === null
            ? null
            : displayNameFor(nicknames, "user", viewer.peerName)
          : message.senderAdminName === null
            ? null
            : adminLabel(
                nicknames,
                message.senderAdminId,
                message.senderAdminName,
                "pt",
              ),
      statusLine:
        mine && message.id !== null && message.id === lastMineStoredId
          ? message.id <= peerReadUpTo
            ? "Đã xem"
            : "Đã gửi"
          : null,
    });
    previousIndex = items.length - 1;
  });
  return items;
};

export { initialsOf } from "@/utils/name";

export const isNearBottom = (
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
) => scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_PX;

// Server → client: Dates cannot be assumed to survive as-is, ISO strings do.
// Accepts the Date or ISO form so action results and page props share it.
type DateLike = Date | string;

export type ServerChatMessage = Omit<
  SerializedChatMessage,
  "createdAt" | "editedAt" | "updatedAt"
> & {
  createdAt: DateLike;
  editedAt: DateLike | null;
  updatedAt: DateLike;
};

const toIso = (value: DateLike) => new Date(value).toISOString();

export const serializeMessage = (
  message: ServerChatMessage,
): SerializedChatMessage => ({
  ...message,
  createdAt: toIso(message.createdAt),
  editedAt: message.editedAt === null ? null : toIso(message.editedAt),
  updatedAt: toIso(message.updatedAt),
});

// "user" or "admin:<id>": how reactions identify me.
export const viewerReactorKey = (viewer: ThreadViewer) =>
  viewer.role === "admin" ? adminReaderKey(viewer.adminId) : USER_READER_KEY;

// Edit and unsend: only my own messages. For an admin "mine" is narrower than
// the right-hand side: only what this admin wrote.
export const isOwnMessage = (message: ThreadMessage, viewer: ThreadViewer) =>
  viewer.role === "admin"
    ? message.senderRole === "admin" && message.senderAdminId === viewer.adminId
    : message.senderRole === "user";

export const canEditOrUnsend = (message: ThreadMessage, viewer: ThreadViewer) =>
  message.id !== null && !message.deleted && isOwnMessage(message, viewer);

// The emoji I reacted with, if any.
export const myReactionOf = (
  message: Pick<ThreadMessage, "reactions">,
  viewer: ThreadViewer,
) => {
  const key = viewerReactorKey(viewer);

  return (
    message.reactions.find((reaction) => reaction.reactorKey === key)?.emoji ??
    null
  );
};

// One reaction per person: replaces mine, or removes it with null.
export const withMyReaction = (
  reactions: SerializedReaction[],
  viewer: ThreadViewer,
  emoji: string | null,
): SerializedReaction[] => {
  const key = viewerReactorKey(viewer);
  const others = reactions.filter((reaction) => reaction.reactorKey !== key);

  if (emoji === null) {
    return others;
  }
  return [
    ...others,
    {
      emoji,
      reactorKey: key,
      reactorName: viewer.role === "admin" ? viewer.adminName : "Bạn",
    },
  ];
};

export interface ReactionGroup {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}

// Chips under a bubble: one per emoji, in the picker's order.
export const groupReactions = (
  reactions: SerializedReaction[],
  viewer: ThreadViewer,
): ReactionGroup[] => {
  const key = viewerReactorKey(viewer);
  const groups: ReactionGroup[] = [];

  for (const emoji of CHAT_REACTION_EMOJIS) {
    const matching = reactions.filter((reaction) => reaction.emoji === emoji);

    if (matching.length > 0) {
      groups.push({
        emoji,
        count: matching.length,
        mine: matching.some((reaction) => reaction.reactorKey === key),
        names: matching.map((reaction) => reaction.reactorName),
      });
    }
  }
  return groups;
};

// What a reply carries about its original (null while it is not stored yet).
export const toReplyTo = (message: ThreadMessage): SerializedReplyTo | null =>
  message.id === null
    ? null
    : {
        id: message.id,
        body: message.deleted ? "" : toReplySnippet(message.body),
        ...(!message.deleted && message.sticker ? { isSticker: true } : {}),
        ...(!message.deleted && message.photo ? { isPhoto: true } : {}),
        senderRole: message.senderRole,
        deleted: message.deleted,
      };

// A reply keeps the snippet it was stored with, and an unsent original does
// not touch the reply row (so no change event reaches it). When the original is
// in the list and unsent, the quote shows the tombstone too.
export const markUnsentQuotes = (
  messages: ThreadMessage[],
): ThreadMessage[] => {
  const unsent = new Set<number>();

  for (const message of messages) {
    if (message.id !== null && message.deleted) {
      unsent.add(message.id);
    }
  }
  if (unsent.size === 0) {
    return messages;
  }
  return messages.map((message) =>
    message.replyTo &&
    !message.replyTo.deleted &&
    unsent.has(message.replyTo.id)
      ? { ...message, replyTo: { ...message.replyTo, body: "", deleted: true } }
      : message,
  );
};

export const UNSENT_TEXT = "Tin nhắn đã bị thu hồi";
export const STICKER_TEXT = "Sticker";

// One line for a quote or the reply bar: the tombstone, "Sticker" or the text.
export const quoteText = (quote: {
  deleted: boolean;
  isSticker?: boolean;
  isPhoto?: boolean;
  body: string;
}) => {
  if (quote.deleted) {
    return UNSENT_TEXT;
  }
  if (quote.isPhoto && quote.body === "") {
    return PHOTO_QUOTE_TEXT;
  }
  return quote.isSticker ? STICKER_TEXT : quote.body;
};

// "10:42, 06/11" for the actions sheet.
export const formatSentAt = (iso: string) => {
  const [, month, day] = dayKey(iso).split("-");

  return `${formatTime(iso)}, ${day}/${month}`;
};

// Who wrote a message, for "Đang trả lời <name>"; nicknames apply (D2).
export const senderLabel = (
  message: ThreadMessage,
  viewer: ThreadViewer,
  nicknames: Readonly<Record<string, string>> = {},
) => {
  if (isOwnMessage(message, viewer)) {
    return "chính mình";
  }
  if (message.senderRole === "admin") {
    return message.senderAdminName === null
      ? PEER_DELETED_NAME
      : adminLabel(
          nicknames,
          message.senderAdminId,
          message.senderAdminName,
          viewer.role === "user" ? "pt" : undefined,
        );
  }
  return viewer.role === "admin"
    ? displayNameFor(nicknames, "user", viewer.peerName ?? "Học viên")
    : "bạn";
};

// Name above a quoted snippet inside a bubble (only the role is known, so the
// PT side uses the shared "pt" nickname).
export const quoteLabel = (
  replyTo: SerializedReplyTo,
  viewer: ThreadViewer,
  nicknames: Readonly<Record<string, string>> = {},
) => {
  if (replyTo.senderRole === viewer.role) {
    return viewer.role === "admin" ? "PT" : "Bạn";
  }
  return viewer.role === "admin"
    ? displayNameFor(nicknames, "user", viewer.peerName ?? "Học viên")
    : displayNameFor(nicknames, "pt", "PT");
};
