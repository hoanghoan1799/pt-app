import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MESSAGES } from "@/i18n/messages";
import { LOCALES } from "@/utils/locale";

const MESSAGES_DIR = join(process.cwd(), "messages");

type Json = { [key: string]: string | Json };

const readNamespace = (locale: string, file: string): Json =>
  JSON.parse(readFileSync(join(MESSAGES_DIR, locale, file), "utf8"));

// "a.b.c" -> value, for every string leaf.
const flatten = (node: Json, prefix = ""): Record<string, string> =>
  Object.entries(node).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return typeof value === "string"
      ? { ...acc, [path]: value }
      : { ...acc, ...flatten(value, path) };
  }, {});

// Argument names of `{name}` and `{count, plural, ...}`; names nested inside
// plural/select branches count too.
const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{\s*([A-Za-z_]\w*)/g)].map((m) => m[1]))]
    .filter((name) => !["one", "other", "zero", "few", "many"].includes(name))
    .sort();

const filesOf = (locale: string) =>
  readdirSync(join(MESSAGES_DIR, locale)).filter((f) => f.endsWith(".json"));

describe("messages", () => {
  const [base, ...others] = LOCALES;
  const baseFiles = filesOf(base).sort();

  it("has the same namespace files in every locale", () => {
    for (const locale of others) {
      expect(filesOf(locale).sort(), locale).toEqual(baseFiles);
    }
  });

  it("registers every namespace file in i18n/messages.ts", () => {
    const namespaces = baseFiles.map((f) => f.replace(/\.json$/, "")).sort();

    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort(), locale).toEqual(namespaces);
    }
  });

  for (const file of baseFiles) {
    describe(file, () => {
      const baseFlat = flatten(readNamespace(base, file));

      for (const locale of others) {
        const flat = flatten(readNamespace(locale, file));

        it(`${locale} has exactly the ${base} keys`, () => {
          const missing = Object.keys(baseFlat).filter((k) => !(k in flat));
          const extra = Object.keys(flat).filter((k) => !(k in baseFlat));

          expect({ missing, extra }).toEqual({ missing: [], extra: [] });
        });

        it(`${locale} uses the same placeholders per key`, () => {
          const mismatched = Object.keys(baseFlat)
            .filter((k) => k in flat)
            .filter(
              (k) =>
                placeholders(baseFlat[k]).join() !==
                placeholders(flat[k]).join(),
            );

          expect(mismatched).toEqual([]);
        });
      }

      it("has no empty strings", () => {
        for (const locale of LOCALES) {
          const empty = Object.entries(flatten(readNamespace(locale, file)))
            .filter(([, value]) => value.trim() === "")
            .map(([key]) => `${locale}:${key}`);

          expect(empty).toEqual([]);
        }
      });
    });
  }
});
