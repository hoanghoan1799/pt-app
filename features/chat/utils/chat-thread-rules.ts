import { TIME_ZONE } from "@/constants/time";

// Pure helpers behind the trainee chat thread: merging, grouping, separators
// and the polling schedule. No React, no network, so every rule is testable.

// A message as the browser holds it: createdAt is the ISO string from JSON.
export interface SerializedChatMessage {
  id: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  senderAdminName: string | null;
  body: string;
  clientId: string;
  createdAt: string;
}

// `sent` = stored on the server; `sending` / `failed` = optimistic own bubble
// (id is null until the server confirms it).
export type DeliveryState = "sent" | "sending" | "failed";

export interface ThreadMessage extends Omit<SerializedChatMessage, "id"> {
  id: number | null;
  delivery: DeliveryState;
}

export const GROUP_GAP_MS = 15 * 60 * 1000;
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

// Newest message from the PT: what "read" is reported against.
export const newestPeerMessageId = (messages: ThreadMessage[]) => {
  let newest = 0;

  for (const message of messages) {
    if (
      message.senderRole === "admin" &&
      message.id !== null &&
      message.id > newest
    ) {
      newest = message.id;
    }
  }
  return newest;
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
      // PT name above the first bubble of a PT run.
      senderName: string | null;
      showAvatar: boolean;
      // "Đã gửi" / "Đã xem", only under my newest stored message.
      statusLine: string | null;
    };

export const PEER_DELETED_NAME = "PT (đã xoá)";

const senderKey = (message: ThreadMessage) =>
  message.senderRole === "user" ? "user" : `admin:${message.senderAdminId}`;

// Turns the message list into render items: day separators, centred time
// stamps after a 15 minute gap, and run grouping (names, avatars, spacing).
export const buildThreadItems = (
  messages: ThreadMessage[],
  peerReadUpTo: number,
  nowMs: number,
): ThreadItem[] => {
  const items: ThreadItem[] = [];
  // Index in `items` of the previous message, reset by any separator.
  let previousIndex = -1;
  let lastMineStoredId: number | null = null;

  for (const message of messages) {
    if (message.senderRole === "user" && message.id !== null) {
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
    const mine = message.senderRole === "user";
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
      senderName:
        !mine && !continuesRun
          ? (message.senderAdminName ?? PEER_DELETED_NAME)
          : null,
      showAvatar: !mine && isLastInRun,
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

// Up to two letters for the round PT avatar.
export const initialsOf = (name: string | null) => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "PT";
  }
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[words.length - 1])[0]];

  return letters.join("").toUpperCase();
};

export const isNearBottom = (
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
) => scrollHeight - scrollTop - clientHeight <= NEAR_BOTTOM_PX;

// Server → client: Dates cannot be assumed to survive as-is, ISO strings do.
export const serializeMessage = (
  message: Omit<SerializedChatMessage, "createdAt"> & { createdAt: Date },
): SerializedChatMessage => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
});
