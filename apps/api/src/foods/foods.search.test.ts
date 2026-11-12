import { describe, expect, it } from "vitest";

import {
  buildFoodListSql,
  containsPattern,
  decodeCursor,
  encodeCursor,
  searchWords,
  seedKeysContaining,
} from "./foods.search.js";

const base = { locale: "vi", limit: 50 } as const;

describe("searchWords", () => {
  it("folds accents, case, spaces and đ like the web filter", () => {
    expect(searchWords("  UC   GA CHIN ")).toEqual(["uc", "ga", "chin"]);
    expect(searchWords("Đậu hũ")).toEqual(["dau", "hu"]);
    expect(searchWords("")).toEqual([]);
    expect(searchWords(undefined)).toEqual([]);
  });
});

describe("containsPattern", () => {
  it("escapes LIKE wildcards so they match literally", () => {
    expect(containsPattern("uc")).toBe("%uc%");
    expect(containsPattern("50%_x\\")).toBe("%50\\%\\_x\\\\%");
  });
});

describe("seedKeysContaining", () => {
  it("finds starter foods by their built-in translation", () => {
    expect(seedKeysContaining("chicken", "en")).toContain("uc ga (chin)");
    expect(seedKeysContaining("鸡胸肉", "zh")).toContain("uc ga (chin)");
    expect(seedKeysContaining("chicken", "vi")).toEqual([]);
  });
});

describe("cursor", () => {
  it("round-trips and refuses garbage", () => {
    const cursor = { nameKey: "uc ga (chin)", id: 7 };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    for (const bad of ["", "%%%", Buffer.from("[1]").toString("base64url")]) {
      expect(() => decodeCursor(bad)).toThrow();
    }
    expect(() =>
      decodeCursor(Buffer.from('["a",0]').toString("base64url")),
    ).toThrow();
  });
});

describe("buildFoodListSql", () => {
  it("lists active foods in byte order with a look-ahead row", () => {
    const { sql, params } = buildFoodListSql(base);

    expect(sql).toContain("archived_at IS NULL");
    expect(sql).toContain('ORDER BY name_key COLLATE "C", id');
    expect(params).toEqual([51]);
  });

  it("adds one LIKE per word and the group, never inlining values", () => {
    const { sql, params } = buildFoodListSql({
      ...base,
      q: "Ức gà",
      group: "meat",
    });

    expect(sql.match(/name_key LIKE/g)).toHaveLength(2);
    expect(sql).not.toContain("uc");
    expect(params).toEqual(["meat", "%uc%", "%ga%", 51]);
  });

  it("searches the translation too for en and zh, folded in SQL", () => {
    const { sql } = buildFoodListSql({ ...base, locale: "en", q: "chicken" });

    expect(sql).toContain("immutable_unaccent(lower(name_en)) LIKE");
    expect(buildFoodListSql({ ...base, locale: "zh", q: "鸡" }).sql).toContain(
      "immutable_unaccent(lower(name_zh)) LIKE",
    );
  });

  it("continues after the cursor", () => {
    const cursor = encodeCursor({ nameKey: "ca", id: 4 });
    const { sql, params } = buildFoodListSql({ ...base, cursor });

    expect(sql).toContain('(name_key COLLATE "C", id) >');
    expect(params).toEqual(["ca", 4, 51]);
  });
});
