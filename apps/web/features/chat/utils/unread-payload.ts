// Defensive readers for the `/api/chat/unread` JSON, shared by the badge and
// the chat bubbles. Anything that is not a finite number becomes 0 / null.

// Group chats (`groups` field): total and the groups that have unread.
export interface GroupUnread {
  total: number;
  perGroup: { groupId: number; unread: number }[];
}

export interface UserUnread {
  count: number;
  coachCount: number;
  // Newest unread loud (non-/imlang) coach message id; null when none.
  latestLoudIncomingId: number | null;
  groups: GroupUnread;
}

export interface AdminUnreadRow {
  userId: number;
  conversationId: number;
  unread: number;
  latestLoudIncomingId: number | null;
}

export interface AdminUnread {
  count: number;
  perTrainee: AdminUnreadRow[];
  groups: GroupUnread;
}

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

export const parseGroupUnread = (data: unknown): GroupUnread => {
  const record = asRecord(asRecord(data).groups);
  const rows = Array.isArray(record.perGroup) ? record.perGroup : [];

  return {
    total: asNumber(record.total) ?? 0,
    perGroup: rows.flatMap((row) => {
      const item = asRecord(row);
      const groupId = asNumber(item.groupId);

      return groupId === null
        ? []
        : [{ groupId, unread: asNumber(item.unread) ?? 0 }];
    }),
  };
};

export const parseUserUnread = (data: unknown): UserUnread => {
  const record = asRecord(data);

  return {
    count: asNumber(record.count) ?? 0,
    coachCount: asNumber(record.coachCount) ?? 0,
    latestLoudIncomingId: asNumber(record.latestLoudIncomingId),
    groups: parseGroupUnread(data),
  };
};

export const parseAdminUnread = (data: unknown): AdminUnread => {
  const record = asRecord(data);
  const rows = Array.isArray(record.perTrainee) ? record.perTrainee : [];

  return {
    count: asNumber(record.count) ?? 0,
    groups: parseGroupUnread(data),
    perTrainee: rows.flatMap((row) => {
      const item = asRecord(row);
      const userId = asNumber(item.userId);

      return userId === null
        ? []
        : [
            {
              userId,
              conversationId: asNumber(item.conversationId) ?? 0,
              unread: asNumber(item.unread) ?? 0,
              latestLoudIncomingId: asNumber(item.latestLoudIncomingId),
            },
          ];
    }),
  };
};

// A badge number: the chat count of the payload plus group chats. A payload
// that is not there yet (first poll) shows the server-rendered `fallback`.
const badgeCount = (data: unknown, fallback: number): number => {
  const count = asNumber(asRecord(data).count);

  return count === null ? fallback : count + parseGroupUnread(data).total;
};

// The admin's badge: trainee chats plus group chats.
export const adminBadgeCount = badgeCount;

// The trainee's tab-bar badge: coach chat and friend chats plus group chats.
export const userBadgeCount = badgeCount;
