// Defensive readers for the `/api/chat/unread` JSON, shared by the badge and
// the chat bubbles. Anything that is not a finite number becomes 0 / null.

export interface UserUnread {
  count: number;
  coachCount: number;
  // Newest unread loud (non-/imlang) coach message id; null when none.
  latestLoudIncomingId: number | null;
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
}

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

export const parseUserUnread = (data: unknown): UserUnread => {
  const record = asRecord(data);

  return {
    count: asNumber(record.count) ?? 0,
    coachCount: asNumber(record.coachCount) ?? 0,
    latestLoudIncomingId: asNumber(record.latestLoudIncomingId),
  };
};

export const parseAdminUnread = (data: unknown): AdminUnread => {
  const record = asRecord(data);
  const rows = Array.isArray(record.perTrainee) ? record.perTrainee : [];

  return {
    count: asNumber(record.count) ?? 0,
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
