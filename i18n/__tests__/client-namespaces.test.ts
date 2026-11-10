import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLIENT_NAMESPACES,
  pickClientMessages,
} from "@/i18n/client-namespaces";
import { MESSAGES } from "@/i18n/messages";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "features", "hooks", "i18n"];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "node_modules"
        ? []
        : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [path]
      : [];
  });

// Every file that calls useTranslations(), "use client" or not: a shared
// component without the directive still runs in the browser when a client
// component imports it, so it counts.
const callers = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map(
  (path) => ({ path, text: readFileSync(path, "utf8") }),
);

const CALL = /useTranslations\(\s*([^)]*)\)/g;
const LITERAL = /^["'`]([A-Za-z0-9_]+)/;

describe("CLIENT_NAMESPACES", () => {
  it("only lists namespaces that exist in every locale", () => {
    for (const messages of Object.values(MESSAGES)) {
      expect(Object.keys(messages)).toEqual(
        expect.arrayContaining([...CLIENT_NAMESPACES]),
      );
    }
  });

  it("has no duplicates", () => {
    expect(new Set(CLIENT_NAMESPACES).size).toBe(CLIENT_NAMESPACES.length);
  });

  it("covers every namespace passed to useTranslations()", () => {
    const listed: readonly string[] = CLIENT_NAMESPACES;
    const used = new Set<string>();

    for (const { text } of callers) {
      for (const match of text.matchAll(CALL)) {
        const literal = LITERAL.exec(match[1].trim());

        if (literal) {
          used.add(literal[1]);
        }
      }
    }
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((ns) => !listed.includes(ns))).toEqual([]);
  });

  it("finds no useTranslations() call the scan cannot read", () => {
    // A bare call or a variable argument hides its namespace, so the list
    // could silently miss it. Use a string literal instead.
    const unreadable = callers.flatMap(({ path, text }) =>
      [...text.matchAll(CALL)]
        .filter((match) => !LITERAL.test(match[1].trim()))
        .map(() => path),
    );

    expect(unreadable).toEqual([]);
  });
});

describe("pickClientMessages", () => {
  it("keeps client namespaces and drops the rest", () => {
    const picked = pickClientMessages({
      chat: { a: "1" },
      errors: { b: "2" },
      push: { c: "3" },
    });

    expect(picked).toEqual({ chat: { a: "1" } });
  });

  it("is smaller than the full vi bundle", () => {
    const full = JSON.stringify(MESSAGES.vi).length;
    const picked = JSON.stringify(pickClientMessages(MESSAGES.vi)).length;

    expect(picked).toBeLessThan(full);
  });
});
