// Links in chat text (KAN-160): finding http(s):// and www. URLs in a message
// body, for the clickable bubbles and the gallery's "Link" tab. Pure; only
// http and https ever become links, so no javascript: or data: URL can.

export type TextToken =
  { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

export interface FoundUrl {
  // The text as written, trailing punctuation removed.
  text: string;
  // Absolute http(s) URL to open.
  href: string;
  // Host without "www.", for the gallery rows.
  domain: string;
}

// A run of non-space characters that starts like a URL. It must start a word:
// "xhttp://a.com" is not a link.
const CANDIDATE = /(?<![^\s([{<"'“‘])(?:https?:\/\/|www\.)\S+/giu;
const TRAILING = /[.,;:!?'"”’…>\]}]+$/u;
const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

const count = (text: string, char: string) => text.split(char).length - 1;

// Drops punctuation that ends a sentence rather than the URL, and a closing
// bracket only when it has no opener inside the URL ("(see https://a.com/x)").
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

const HOST_WITH_DOT = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;

const toFoundUrl = (candidate: string): FoundUrl | null => {
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

// The message split into plain text and links, in order; joining the `text`
// of every token gives back the original body.
export const tokenizeLinks = (body: string): TextToken[] => {
  const tokens: TextToken[] = [];
  let cursor = 0;

  for (const match of body.matchAll(CANDIDATE)) {
    const found = toFoundUrl(match[0]);

    if (!found) {
      continue;
    }
    const start = match.index;

    if (start > cursor) {
      tokens.push({ kind: "text", text: body.slice(cursor, start) });
    }
    tokens.push({ kind: "link", text: found.text, href: found.href });
    cursor = start + found.text.length;
  }
  if (cursor < body.length) {
    tokens.push({ kind: "text", text: body.slice(cursor) });
  }
  return tokens;
};

// Every distinct link of a body, in order of appearance.
export const extractUrls = (body: string): FoundUrl[] => {
  const seen = new Set<string>();
  const found: FoundUrl[] = [];

  for (const match of body.matchAll(CANDIDATE)) {
    const url = toFoundUrl(match[0]);

    if (url && !seen.has(url.href)) {
      seen.add(url.href);
      found.push(url);
    }
  }
  return found;
};
