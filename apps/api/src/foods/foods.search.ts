import { BadRequestException } from "@nestjs/common";
import { type FoodListQuery, type FoodLocale, toNameKey } from "@pt/contracts";

import { SEED_FOOD_TRANSLATIONS } from "./seed/food-translations.js";

// The words of a search: accent-free, lower-cased, split on spaces. Every word
// must appear in the name, in any order (filterFoods in the web).
export const searchWords = (query: string | undefined) =>
  toNameKey(query ?? "")
    .split(" ")
    .filter(Boolean);

// A LIKE pattern that finds `word` anywhere; `%`, `_` and `\` are literal.
export const containsPattern = (word: string) =>
  `%${word.replace(/[\\%_]/g, "\\$&")}%`;

// Starter foods whose built-in translation contains the word. Foods seeded
// before the translation columns existed have blank columns and are
// translated from this map at read time (localizeFood in the web).
export const seedKeysContaining = (word: string, locale: FoodLocale) => {
  if (locale === "vi") {
    return [];
  }

  return Object.entries(SEED_FOOD_TRANSLATIONS)
    .filter(([, translation]) =>
      toNameKey(translation[locale]).includes(word),
    )
    .map(([nameKey]) => nameKey);
};

// Position in the list: the key the list is sorted by, then the id.
export type FoodCursor = { nameKey: string; id: number };

export const encodeCursor = (cursor: FoodCursor) =>
  Buffer.from(JSON.stringify([cursor.nameKey, cursor.id])).toString(
    "base64url",
  );

export const decodeCursor = (raw: string): FoodCursor => {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );

    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      Number.isInteger(parsed[1]) &&
      parsed[1] > 0 &&
      parsed[1] <= 2_147_483_647
    ) {
      return { nameKey: parsed[0], id: parsed[1] as number };
    }
  } catch {
    // falls through to the error below
  }
  throw new BadRequestException({
    code: "VALIDATION_FAILED",
    message: "cursor: Con trỏ trang không hợp lệ",
  });
};

export const FOOD_COLUMNS = `id, name, name_key AS "nameKey", name_en AS "nameEn", name_zh AS "nameZh",
  "group", state, kcal, protein, carbs, fat, fiber,
  serving_label AS "servingLabel", serving_grams AS "servingGrams", source`;

const TRANSLATION_COLUMN = { en: "name_en", zh: "name_zh" } as const;

// The list query. Active foods only, sorted by the search key in byte order
// (SQLite's order, not the database collation) with the id as tie-breaker, so
// pages keyset-paginate without gaps. Returns `limit + 1` rows at most: the
// extra row tells there is a next page.
export const buildFoodListSql = (query: FoodListQuery) => {
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = ["archived_at IS NULL"];

  if (query.group) {
    where.push(`"group" = ${param(query.group)}`);
  }

  for (const word of searchWords(query.q)) {
    const pattern = param(containsPattern(word));

    if (query.locale === "vi") {
      where.push(`name_key LIKE ${pattern}`);
      continue;
    }

    const column = TRANSLATION_COLUMN[query.locale];
    const seedKeys = param(seedKeysContaining(word, query.locale));

    where.push(
      `(name_key LIKE ${pattern}
        OR immutable_unaccent(lower(${column})) LIKE ${pattern}
        OR (btrim(coalesce(${column}, '')) = '' AND name_key = ANY(${seedKeys}::text[])))`,
    );
  }

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);

    where.push(
      `(name_key COLLATE "C", id) > (${param(cursor.nameKey)}::text COLLATE "C", ${param(cursor.id)}::int)`,
    );
  }

  const sql = `SELECT ${FOOD_COLUMNS} FROM foods WHERE ${where.join(" AND ")}
    ORDER BY name_key COLLATE "C", id LIMIT ${param(query.limit + 1)}`;

  return { sql, params };
};
