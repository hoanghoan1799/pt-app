import {
  GROUP_MEMBER_CAP,
  type GroupPtChangeEvent,
  type GroupSummary,
  type GroupSystemEvent,
  type GroupSystemLine,
  toGroupSystemLine,
} from "@pt/contracts";

import { matchesInboxSearch } from "@/features/chat/utils/inbox-search";

// Small pure rules behind the group screens: how a system line is worded, the
// alert's state, the inbox preview kind and the member picker.

export interface LineLabels {
  // Shown for a member whose account is gone.
  deletedMember: string;
  // Shown for a PT slot that is empty (a trainee without a PT).
  noPt: string;
}

// The i18n key and params of a system line. A name the API could not resolve
// (deleted account) reads as the "deleted member" label, and an empty PT slot
// as "no PT".
export const systemLineOf = (
  event: GroupSystemEvent | null,
  eventNames: Readonly<Record<string, string | null>>,
  labels: LineLabels,
): GroupSystemLine => {
  const line = toGroupSystemLine(
    event,
    (key) => eventNames[key] ?? labels.deletedMember,
  );

  if (event?.type !== "pt_changed") {
    return line;
  }
  return {
    ...line,
    params: {
      ...line.params,
      from: event.fromPtId === null ? labels.noPt : line.params.from,
      to: event.toPtId === null ? labels.noPt : line.params.to,
    },
  };
};

export type AlertState = "open" | "keep" | "remove" | "superseded";

// The PT-change alert's state, or null for any other line. Only an alert the
// viewer may see ever reaches the browser; the buttons need `canResolve` too.
export const alertStateOf = (
  event: GroupSystemEvent | null,
): AlertState | null =>
  event?.type === "pt_changed" ? (event.resolution?.choice ?? "open") : null;

export const showsAlertButtons = (
  event: GroupSystemEvent | null,
  canResolve: boolean,
): event is GroupPtChangeEvent => canResolve && alertStateOf(event) === "open";

export type PreviewKind =
  "none" | "text" | "photo" | "sticker" | "system" | "unsent";

type LastMessage = GroupSummary["lastMessage"];

// What the inbox row says under the group name. The API already blanks
// unsent and hidden text, so an empty preview of a real message is a photo, a
// sticker (`media`) or a text that was unsent or hidden.
export const previewKindOf = (last: LastMessage): PreviewKind => {
  if (!last) {
    return "none";
  }
  if (last.kind === "system") {
    return "system";
  }
  if (last.preview !== "") {
    return "text";
  }
  return last.media ?? "unsent";
};

export interface PickerCandidate {
  key: string;
  name: string;
}

// Search like the inbox: case and accents ignored, empty matches everyone.
export const filterCandidates = <T extends PickerCandidate>(
  candidates: readonly T[],
  query: string,
): T[] => candidates.filter((item) => matchesInboxSearch(query, item.name));

// Adds or removes one key. Adding beyond `cap` is refused (the set is returned
// unchanged), so the picker never offers more than the group can hold.
export const toggleSelection = (
  selected: ReadonlySet<string>,
  key: string,
  cap: number = GROUP_MEMBER_CAP,
): ReadonlySet<string> => {
  const next = new Set(selected);

  if (next.has(key)) {
    next.delete(key);
    return next;
  }
  if (next.size >= cap) {
    return selected;
  }
  next.add(key);
  return next;
};

// The ids the create and add actions take, split by kind and in a stable order.
export const selectionToIds = (selected: ReadonlySet<string>) => {
  const userIds: number[] = [];
  const ptIds: number[] = [];

  for (const key of selected) {
    const [kind, raw] = key.split(":");
    const id = Number(raw);

    if (!Number.isSafeInteger(id) || id <= 0) {
      continue;
    }
    (kind === "user" ? userIds : kind === "admin" ? ptIds : []).push(id);
  }
  return { userIds, ptIds };
};
