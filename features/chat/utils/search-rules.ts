import { TIME_ZONE } from "@/constants/time";
import { adminLabel } from "@/features/chat/utils/chat-settings";
import { PEER_DELETED_NAME } from "@/features/chat/utils/chat-thread-rules";
import { displayNameFor } from "@/features/chat/utils/display-name";
import { formatShortDateTime } from "@/utils/time";

// Searching inside one conversation (KAN-160, S1 and S2): pure rules shared by
// the service, the route and the page.

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
export const SEARCH_PAGE_SIZE = 20;
// Characters of context on each side of the match in a snippet.
export const SNIPPET_CONTEXT = 40;

const MARKS = /\p{M}/gu;

// Accent-insensitive form of one piece of text: decomposed, marks removed,
// "đ" read as "d", lower-cased. "Đồ ĂN" becomes "do an".
export const foldText = (text: string) =>
  text.normalize("NFD").toLowerCase().replace(MARKS, "").replace(/đ/g, "d");

const collapse = (text: string) => text.trim().replace(/\s+/g, " ");

// The folded, whitespace-collapsed query; what the matcher compares with.
export const foldQuery = (query: string) => foldText(collapse(query));

export const queryLength = (query: string) =>
  Array.from(collapse(query)).length;

// A query is searched when it has at least two characters (not counting
// surrounding spaces) and is not absurdly long.
export const isSearchableQuery = (query: string) => {
  const length = queryLength(query);

  return length >= SEARCH_MIN_LENGTH && length <= SEARCH_MAX_LENGTH;
};

// `q` and the optional `before` cursor of the search routes. A query that is
// too short or too long, or a cursor that is not a plain id, is refused.
export const parseSearchParams = (
  params: URLSearchParams,
): { ok: true; query: string; before: number | undefined } | { ok: false } => {
  const query = params.get("q") ?? "";
  const cursor = params.get("before");

  if (!isSearchableQuery(query)) {
    return { ok: false };
  }
  if (cursor === null) {
    return { ok: true, query, before: undefined };
  }
  return /^[1-9]\d{0,14}$/.test(cursor)
    ? { ok: true, query, before: Number(cursor) }
    : { ok: false };
};

export interface MatchRange {
  // UTF-16 offsets into the original text.
  start: number;
  end: number;
}

// Finds the first accent-insensitive match of the query and returns its range
// in the ORIGINAL text, so the result can show (and bold) what was written.
// The text is folded one character at a time so that the offsets of the
// folded and the original text can be mapped back; combining marks of
// decomposed input stay attached to the letter before them, and a run of
// spaces or line breaks reads as one space, like in the query.
export const findMatch = (text: string, query: string): MatchRange | null => {
  const needle = foldQuery(query);

  if (needle === "") {
    return null;
  }
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;

  for (const char of text) {
    const next = offset + char.length;
    const piece = foldText(char);

    if (piece === "") {
      // A bare combining mark: part of the letter before it.
      if (ends.length > 0) {
        ends[ends.length - 1] = next;
      }
    }
    for (const letter of piece) {
      if (/\s/.test(letter)) {
        if (folded.endsWith(" ")) {
          ends[ends.length - 1] = next;
          continue;
        }
        folded += " ";
        starts.push(offset);
        ends.push(next);
        continue;
      }
      // One entry per UTF-16 unit, like the indexes of `folded`.
      for (let unit = 0; unit < letter.length; unit += 1) {
        starts.push(offset);
        ends.push(next);
      }
      folded += letter;
    }
    offset = next;
  }
  const at = folded.indexOf(needle);

  return at === -1
    ? null
    : { start: starts[at], end: ends[at + needle.length - 1] };
};

export const matchesQuery = (text: string, query: string) =>
  findMatch(text, query) !== null;

export interface Snippet {
  // Text before the match (with a leading "…" when cut), the match as written,
  // and the text after it (with a trailing "…" when cut).
  before: string;
  match: string;
  after: string;
}

// A short piece of the message around the match. Line breaks become spaces so
// a result stays on a line or two.
export const buildSnippet = (
  text: string,
  range: MatchRange,
  context = SNIPPET_CONTEXT,
): Snippet => {
  const flat = (value: string) => value.replace(/\s+/g, " ");
  const from = Math.max(0, range.start - context);
  const to = Math.min(text.length, range.end + context);

  return {
    before: `${from > 0 ? "…" : ""}${flat(text.slice(from, range.start))}`,
    match: flat(text.slice(range.start, range.end)),
    after: `${flat(text.slice(range.end, to))}${to < text.length ? "…" : ""}`,
  };
};

export interface SearchResult {
  messageId: number;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  // Null when the PT was deleted afterwards.
  senderName: string | null;
  snippet: Snippet;
  createdAt: string;
}

export interface SearchPage {
  results: SearchResult[];
  // Message id to pass as `before` to continue; null when there is no more.
  nextCursor: number | null;
}

// Who wrote it, as the viewer sees names: their own messages are "Bạn",
// nicknames apply (a trainee sees the shared PT nickname).
export const searchSenderLabel = (
  result: Pick<SearchResult, "senderRole" | "senderAdminId" | "senderName">,
  viewer:
    | { role: "user" }
    | { role: "admin"; adminId: number; peerName: string | null },
  nicknames: Readonly<Record<string, string>> = {},
) => {
  if (viewer.role === "admin") {
    if (result.senderRole === "admin") {
      return result.senderAdminId === viewer.adminId
        ? "Bạn"
        : result.senderName === null
          ? PEER_DELETED_NAME
          : adminLabel(nicknames, result.senderAdminId, result.senderName);
    }
    return displayNameFor(nicknames, "user", viewer.peerName ?? "Học viên");
  }
  if (result.senderRole === "user") {
    return "Bạn";
  }
  return result.senderName === null
    ? PEER_DELETED_NAME
    : adminLabel(nicknames, result.senderAdminId, result.senderName, "pt");
};

// "05/10 18:32", with the year when it is not the current one.
export const formatResultTime = (createdAtIso: string, nowMs: number) => {
  const at = Date.parse(createdAtIso);
  const year = (ms: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
    }).format(ms);
  const stamp = formatShortDateTime(at, TIME_ZONE);

  return year(at) === year(nowMs)
    ? stamp
    : `${stamp.slice(0, 5)}/${year(at)}${stamp.slice(5)}`;
};
