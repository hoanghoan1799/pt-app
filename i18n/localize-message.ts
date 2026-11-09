import { createTranslator } from "next-intl";

import enErrors from "@/messages/en/errors.json";
import viErrors from "@/messages/vi/errors.json";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// Messages that leave the server (action results, Zod issues, API replies) are
// built from Vietnamese constants and schema strings, and Vietnamese output
// must stay byte-identical. So the `errors` namespace holds those exact
// strings in `vi`, and this module maps a known Vietnamese message back to its
// key and renders the active locale. Text it does not know passes through.
//
// Only the small `errors` files are loaded, so client bundles can use it too.

// Namespaces that are not Vietnamese messages to look up.
const IGNORED_GROUPS = new Set(["reference", "toasts"]);

// Numbers in a templated message: "60", "0,5", "-1000".
const NUMBER = String.raw`-?\d+(?:[.,]\d+)?`;

type Group = Record<string, string>;

const entries = Object.entries(viErrors as Record<string, Group>).flatMap(
  ([group, messages]) =>
    IGNORED_GROUPS.has(group)
      ? []
      : Object.entries(messages).map(
          ([name, text]) => ({ key: `${group}.${name}`, text }) as const,
        ),
);

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

// Field labels that fill `{label}`: "Nhập Tuổi" must not match any "Nhập …".
const labels = Object.values((viErrors as Record<string, Group>).labels);
const LABEL = `(?:${labels.map(escapeRegex).join("|")})`;

const PLACEHOLDER = /\{(\w+)\}/g;

const exact = new Map<string, string>();
const patterns: {
  key: string;
  regex: RegExp;
  params: string[];
  literal: number;
}[] = [];

for (const { key, text } of entries) {
  const params = [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);

  if (params.length === 0) {
    if (!exact.has(text)) {
      exact.set(text, key);
    }
    continue;
  }

  const source = text
    .split(PLACEHOLDER)
    .map((part, index) =>
      // split() with a capture group alternates literal, name, literal…
      index % 2 === 0
        ? escapeRegex(part)
        : `(${part === "label" ? LABEL : NUMBER})`,
    )
    .join("");

  patterns.push({
    key,
    regex: new RegExp(`^${source}$`),
    params,
    literal: text.replace(PLACEHOLDER, "").length,
  });
}

// The most specific template (most fixed text) wins.
patterns.sort((a, b) => b.literal - a.literal);

type Translate = (key: string, values?: Record<string, string>) => string;

const translators: Partial<Record<Locale, Translate>> = {};

const getTranslate = (locale: Locale) =>
  (translators[locale] ??= createTranslator({
    locale,
    messages: { errors: locale === "en" ? enErrors : viErrors },
    namespace: "errors",
  }) as unknown as Translate);

// A message that is exactly a known Vietnamese string gets its text; a
// templated one (limits, field labels) is matched and re-rendered; anything
// else is returned as it came.
export const localizeMessageFor = (locale: Locale, text: string) => {
  if (locale === DEFAULT_LOCALE) {
    return text;
  }

  const translate = getTranslate(locale);
  const key = exact.get(text);

  if (key) {
    return translate(key);
  }

  for (const pattern of patterns) {
    const match = pattern.regex.exec(text);

    if (match) {
      const values = Object.fromEntries(
        pattern.params.map((name, index) => {
          const value = match[index + 1];

          return [
            name,
            name === "label" ? translate(exact.get(value) ?? "") : value,
          ];
        }),
      );

      return translate(pattern.key, values);
    }
  }
  return text;
};

// "Mã tham chiếu: 3f9a1c2e" / "Reference code: 3f9a1c2e".
export const describeReferenceFor = (locale: Locale, reference: string) =>
  getTranslate(locale)("reference.label", { reference });

type FormLike = { message?: unknown; fieldErrors?: unknown };

// Localizes the texts an action result may carry: `message` and the
// per-field `fieldErrors`. Everything else (data, user content) is untouched.
export const localizeResultFor = <T>(locale: Locale, result: T): T => {
  if (locale === DEFAULT_LOCALE || typeof result !== "object" || !result) {
    return result;
  }

  const { message, fieldErrors } = result as FormLike;
  const next: Record<string, unknown> = { ...(result as object) };

  if (typeof message === "string") {
    next.message = localizeMessageFor(locale, message);
  }
  if (fieldErrors && typeof fieldErrors === "object") {
    next.fieldErrors = Object.fromEntries(
      Object.entries(fieldErrors).map(([field, text]) => [
        field,
        typeof text === "string" ? localizeMessageFor(locale, text) : text,
      ]),
    );
  }
  return next as T;
};
