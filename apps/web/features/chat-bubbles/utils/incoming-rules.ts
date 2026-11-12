export interface IncomingEntry {
  key: string;
  // Newest unread loud (non-/imlang) incoming message id, null when none.
  latestLoudIncomingId: number | null;
}

export type SeenIds = Readonly<Record<string, number>>;

interface DetectInput {
  // null before the first poll: that poll only records the baseline.
  seen: SeenIds | null;
  entries: readonly IncomingEntry[];
  // Chats the user is looking at right now (full screen or in the open panel).
  onScreenKeys: readonly string[];
  mutedKeys: readonly string[];
  // The per-device "pop on new messages" switch.
  enabled: boolean;
}

// Which chats get a new collapsed bubble, and the ids seen so far. A chat pops
// only when its latest loud id grew since the last poll.
export const detectIncoming = ({
  seen,
  entries,
  onScreenKeys,
  mutedKeys,
  enabled,
}: DetectInput): { popKeys: string[]; nextSeen: SeenIds } => {
  const nextSeen: Record<string, number> = { ...seen };
  const popKeys: string[] = [];

  for (const { key, latestLoudIncomingId } of entries) {
    if (latestLoudIncomingId === null) {
      continue;
    }
    const before = seen?.[key] ?? 0;
    const grew = latestLoudIncomingId > before;

    nextSeen[key] = Math.max(before, latestLoudIncomingId);
    if (
      seen !== null &&
      grew &&
      enabled &&
      !onScreenKeys.includes(key) &&
      !mutedKeys.includes(key)
    ) {
      popKeys.push(key);
    }
  }
  return { popKeys, nextSeen };
};
