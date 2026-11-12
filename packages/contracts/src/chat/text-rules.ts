import { parseActorRef, userActorKey } from "../users/alias-rules.js";
import { PT_ALIAS_TARGET } from "../users/constants.js";
import {
  CHAT_PREVIEW_LENGTH,
  CHAT_REPLY_SNIPPET_LENGTH,
  CHAT_SEARCH_MAX_LENGTH,
  CHAT_SEARCH_MIN_LENGTH,
  CHAT_SNIPPET_CONTEXT,
} from "./constants.js";

// Pure text rules of the chat: slash commands, links, the accent-insensitive
// search fold and snippets. Ported from apps/web/features/chat/utils.

// --- Slash commands (KAN-167) ---------------------------------------------

export type ChatCommandEffects = {
  // Store the message as usual but send no push notification.
  silent?: boolean;
};

export type ChatCommand = {
  name: string;
  effects: ChatCommandEffects;
};

// To add a command: append an entry here.
export const CHAT_COMMANDS: readonly ChatCommand[] = [
  { name: "imlang", effects: { silent: true } },
];

const COMMAND_PREFIX = /^\/([A-Za-z]+)(?=\s|$)\s*/;

// Only a leading `/<name>` followed by whitespace or the end counts. The
// prefix and the whitespace after it are stripped; anything else is plain text.
export const chatParseCommand = (text: string) => {
  const match = COMMAND_PREFIX.exec(text);
  const command = match
    ? (CHAT_COMMANDS.find((item) => item.name === match[1].toLowerCase()) ??
      null)
    : null;

  if (!match || !command) {
    return {
      body: text.trim(),
      command: null,
      effects: {} as ChatCommandEffects,
    };
  }
  return {
    body: text.slice(match[0].length).trim(),
    command,
    effects: command.effects,
  };
};

// --- Previews ---------------------------------------------------------------

export const chatToReplySnippet = (body: string) =>
  Array.from(body).slice(0, CHAT_REPLY_SNIPPET_LENGTH).join("");

export const chatToPreview = (body: string) =>
  Array.from(body).slice(0, CHAT_PREVIEW_LENGTH).join("");

// Read cursors only move forward and never past the newest message; bad
// input leaves the cursor where it was.
export const chatNextReadCursor = (
  current: number,
  requested: number,
  lastMessageId: number,
) => {
  const isCursor = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

  if (!isCursor(requested) || !isCursor(lastMessageId)) {
    return current;
  }
  return Math.max(current, Math.min(requested, lastMessageId));
};

// --- Links ------------------------------------------------------------------

export type ChatFoundUrl = {
  // The text as written, trailing punctuation removed.
  text: string;
  // Absolute http(s) URL to open.
  href: string;
  // Host without "www.".
  domain: string;
};

// A run of non-space characters that starts like a URL. It must start a word:
// "xhttp://a.com" is not a link.
const CANDIDATE = /(?<![^\s([{<"'“‘])(?:https?:\/\/|www\.)\S+/giu;
const TRAILING = /[.,;:!?'"”’…>\]}]+$/u;
const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const HOST_WITH_DOT = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;

const count = (text: string, char: string) => text.split(char).length - 1;

// Drops punctuation that ends a sentence rather than the URL, and a closing
// bracket only when it has no opener inside the URL.
const trimTrailing = (raw: string) => {
  let text = raw;

  for (;;) {
    const stripped = text.replace(TRAILING, "");
    const last = stripped.slice(-1);
    const opener = PAIRS[last];

    if (opener && count(stripped, last) > count(stripped, opener)) {
      text = stripped.slice(0, -1);
      continue;
    }
    if (stripped === text) {
      return text;
    }
    text = stripped;
  }
};

const toFoundUrl = (candidate: string): ChatFoundUrl | null => {
  const text = trimTrailing(candidate);
  const href = /^www\./i.test(text) ? `https://${text}` : text;
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    !HOST_WITH_DOT.test(url.hostname)
  ) {
    return null;
  }
  return {
    text,
    href: url.href,
    domain: url.hostname.replace(/^www\./i, ""),
  };
};

// Every distinct link of a body, in order of appearance.
export const chatExtractUrls = (body: string): ChatFoundUrl[] => {
  const seen = new Set<string>();
  const found: ChatFoundUrl[] = [];

  for (const match of body.matchAll(CANDIDATE)) {
    const url = toFoundUrl(match[0]);

    if (url && !seen.has(url.href)) {
      seen.add(url.href);
      found.push(url);
    }
  }
  return found;
};

// --- Accent-insensitive search ---------------------------------------------

const MARKS = /\p{M}/gu;

// Decomposed, marks removed, "đ" read as "d", lower-cased: "Đồ ĂN" becomes
// "do an". The database side is immutable_unaccent(lower(body)), which maps
// the same letters (see the unaccent e2e test).
export const chatFoldText = (text: string) =>
  text.normalize("NFD").toLowerCase().replace(MARKS, "").replace(/đ/g, "d");

const collapse = (text: string) => text.trim().replace(/\s+/g, " ");

// The folded, whitespace-collapsed query.
export const chatFoldQuery = (query: string) => chatFoldText(collapse(query));

export const chatQueryLength = (query: string) =>
  Array.from(collapse(query)).length;

// A query is searched when it has at least two characters (not counting
// surrounding spaces) and is not absurdly long.
export const chatIsSearchableQuery = (query: string) => {
  const length = chatQueryLength(query);

  return length >= CHAT_SEARCH_MIN_LENGTH && length <= CHAT_SEARCH_MAX_LENGTH;
};

export type ChatMatchRange = {
  // UTF-16 offsets into the original text.
  start: number;
  end: number;
};

// Finds the first accent-insensitive match of the query and returns its range
// in the ORIGINAL text, so the result can show what was written. The text is
// folded one character at a time so the offsets can be mapped back; a run of
// spaces or line breaks reads as one space, like in the query.
export const chatFindMatch = (
  text: string,
  query: string,
): ChatMatchRange | null => {
  const needle = chatFoldQuery(query);

  if (needle === "") {
    return null;
  }
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;

  for (const char of text) {
    const next = offset + char.length;
    const piece = chatFoldText(char);

    if (piece === "" && ends.length > 0) {
      // A bare combining mark: part of the letter before it.
      ends[ends.length - 1] = next;
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

export type ChatSnippet = {
  // Text before the match (with a leading "…" when cut), the match as written,
  // and the text after it (with a trailing "…" when cut).
  before: string;
  match: string;
  after: string;
};

// A short piece of the message around the match. Line breaks become spaces.
export const chatBuildSnippet = (
  text: string,
  range: ChatMatchRange,
  context = CHAT_SNIPPET_CONTEXT,
): ChatSnippet => {
  const flat = (value: string) => value.replace(/\s+/g, " ");
  const from = Math.max(0, range.start - context);
  const to = Math.min(text.length, range.end + context);

  return {
    before: `${from > 0 ? "…" : ""}${flat(text.slice(from, range.start))}`,
    match: flat(text.slice(range.start, range.end)),
    after: `${flat(text.slice(range.end, to))}${to < text.length ? "…" : ""}`,
  };
};

// The folded words of a query joined by `%`: a LIKE pattern that is a superset
// of what chatFindMatch accepts (a line break or double space in the body
// still matches a single space in the query). The caller escapes `\`, `%`,
// `_` in each word and keeps chatFindMatch as the final check.
export const chatSearchWords = (query: string) =>
  chatFoldQuery(query)
    .split(" ")
    .filter((word) => word !== "");

// --- Nicknames ----------------------------------------------------------------

// The viewer's aliases in the keys a chat conversation uses: "user" for the
// conversation's trainee, "pt" and "admin:<id>" as they are. The viewer's own
// key is never aliased, and aliases of people outside the conversation are
// left out.
export const chatAliasesToNicknames = (
  aliases: ReadonlyMap<string, string>,
  context: { viewerKey: string; traineeUserId: number },
): Record<string, string> => {
  const traineeKey = userActorKey(context.traineeUserId);
  const nicknames: Record<string, string> = {};

  for (const [targetKey, alias] of aliases) {
    if (targetKey === context.viewerKey || !alias.trim()) {
      continue;
    }
    if (targetKey === traineeKey) {
      nicknames.user = alias;
    } else if (
      targetKey === PT_ALIAS_TARGET ||
      parseActorRef(targetKey)?.kind === "admin"
    ) {
      nicknames[targetKey] = alias;
    }
  }
  return nicknames;
};
