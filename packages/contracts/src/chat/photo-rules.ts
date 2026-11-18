import { CHAT_MESSAGE_MAX_PHOTOS } from "./constants.js";

// Pure rules of messages and posts with several photos (up to 10, the first is
// the cover). Ported from the web's features/chat/utils/photo-rules.ts.

// How many of `picked` new photos fit next to `current` ones under `max`, and
// how many do not (a composer keeps the first ones and says so).
export const chatPhotoSlots = (
  current: number,
  picked: number,
  max: number = CHAT_MESSAGE_MAX_PHOTOS,
) => {
  const free = Math.max(0, max - current);
  const accepted = Math.min(free, Math.max(0, picked));

  return { accepted, dropped: Math.max(0, picked) - accepted };
};

// The photo ids a send request carries, in display order: `photoIds`, else the
// single `photoId` an older client sends, else none.
export const photoIdsOf = (input: {
  photoId?: number | null;
  photoIds?: readonly number[];
}): number[] => {
  if (input.photoIds && input.photoIds.length > 0) {
    return [...input.photoIds];
  }
  return input.photoId === undefined || input.photoId === null
    ? []
    : [input.photoId];
};

// A stored photo row of a message, DM message or post: `ownerId` is the message
// or post it is attached to (null while pending).
export type StoredPhotoRow = {
  id: number;
  ownerId: number | null;
  // Order inside the owner (0 = cover); null (a row from before several
  // photos) counts as 0.
  position: number | null;
};

// Groups photo rows by owner in display order: position (null counts as 0),
// then id. Pending rows and rows of owners not in `owners` are dropped.
export const groupPhotosByOwner = <T extends StoredPhotoRow>(
  rows: readonly T[],
  owners: Iterable<number>,
): Map<number, T[]> => {
  const wanted = new Set(owners);
  const ordered = [...rows].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id,
  );
  const result = new Map<number, T[]>();
  const seen = new Set<number>();

  for (const row of ordered) {
    if (row.ownerId === null || !wanted.has(row.ownerId) || seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    const list = result.get(row.ownerId) ?? [];

    list.push(row);
    result.set(row.ownerId, list);
  }
  return result;
};
