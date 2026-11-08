import type { DmMessageView } from "@/features/social/types/dm";

// Client-side thread state (pure, so it is unit tested): merging polled pages
// into what the screen shows.

export type DmThreadItem = DmMessageView & {
  // Set while the message has no server id yet.
  pending?: "sending" | "failed";
};

export const lastServerId = (items: DmThreadItem[]) =>
  items.reduce((max, item) => (item.pending ? max : Math.max(max, item.id)), 0);

// Adds fetched messages (deduped by id and by clientId, so a polled copy of an
// own optimistic message replaces it), drops unsent ones, keeps order by id
// with pending messages last.
export const mergeThread = (
  current: DmThreadItem[],
  fetched: DmMessageView[],
  deletedIds: number[],
): DmThreadItem[] => {
  const removed = new Set(deletedIds);
  const byClient = new Map(fetched.map((m) => [m.clientId, m]));
  const confirmed = current.filter((item) => !item.pending);
  const pending = current.filter(
    (item) => item.pending && !byClient.has(item.clientId),
  );
  const known = new Set(confirmed.map((item) => item.id));
  const merged: DmThreadItem[] = [
    ...confirmed,
    ...fetched.filter((m) => !known.has(m.id)),
  ];

  return [
    ...merged
      .filter((item) => !removed.has(item.id))
      .sort((a, b) => a.id - b.id),
    ...pending,
  ];
};

// Prepends older messages already known to the screen.
export const prependOlder = (
  current: DmThreadItem[],
  older: DmMessageView[],
): DmThreadItem[] => {
  const known = new Set(current.map((item) => item.id));

  return [...older.filter((m) => !known.has(m.id)), ...current];
};

// The last own message the other member has read ("Đã xem").
export const lastSeenOwnId = (
  items: DmThreadItem[],
  meId: number,
  otherReadUpTo: number,
) => {
  const own = items.filter(
    (item) =>
      !item.pending && item.senderId === meId && item.id <= otherReadUpTo,
  );

  return own.length === 0 ? null : own[own.length - 1].id;
};
