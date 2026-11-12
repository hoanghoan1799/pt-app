import {
  CHAT_PHOTO_MAX_BYTES,
  chatAliasesToNicknames,
  chatBuildSnippet,
  chatCheckPhoto,
  chatExtractUrls,
  chatFindMatch,
  chatFoldText,
  chatIsSearchableQuery,
  chatNextReadCursor,
  chatParseCommand,
  chatSearchQuerySchema,
  chatSearchWords,
  chatSendMessageRequestSchema,
  chatThreadQuerySchema,
  findBundledSticker,
  stickerCheckImage,
  stickerInputSchema,
  stickerMapGiphyResponse,
  stickerNormalizeGiphyQuery,
  stickerToStored,
  stickerToView,
} from "../index.js";
import { describe, expect, it } from "vitest";

const customUrl = (id: number) => `/v1/chat/stickers/custom/${id}`;

describe("accent-insensitive search fold", () => {
  it("removes accents, lower-cases and reads đ as d", () => {
    expect(chatFoldText("Đồ ĂN")).toBe("do an");
    expect(chatFoldText("Đường đi Việt Nam")).toBe("duong di viet nam");
    expect(chatFoldText("Cơm gà ĐẬU HŨ")).toBe("com ga dau hu");
  });

  it("folds decomposed (NFD) text like composed text", () => {
    expect(chatFoldText("Tập Đùi".normalize("NFD"))).toBe("tap dui");
  });

  it("finds a match and returns its range in the original text", () => {
    const text = "Hôm nay Tập Chân nhé";
    const range = chatFindMatch(text, "tap chan");

    expect(range).not.toBeNull();
    expect(text.slice(range?.start, range?.end)).toBe("Tập Chân");
    expect(chatFindMatch(text, "đùi")).toBeNull();
    expect(chatFindMatch(text, "   ")).toBeNull();
  });

  it("finds đ with d and d with đ", () => {
    expect(chatFindMatch("Đùi sau", "dui")).toEqual({ start: 0, end: 3 });
    expect(chatFindMatch("dui sau", "đùi")).toEqual({ start: 0, end: 3 });
  });

  it("reads a run of spaces or a line break as one space", () => {
    expect(chatFindMatch("yến\n  mạch", "yen mach")).toEqual({
      start: 0,
      end: 10,
    });
  });

  it("keeps a combining mark attached to its letter in the range", () => {
    const text = "ém";
    const range = chatFindMatch(text, "e");

    expect(text.slice(range?.start, range?.end)).toBe("é");
  });

  it("splits a query into folded words for the database pre-filter", () => {
    expect(chatSearchWords("  Đồ   ĂN ")).toEqual(["do", "an"]);
  });

  it("accepts 2 to 100 characters, not counting surrounding spaces", () => {
    expect(chatIsSearchableQuery("a")).toBe(false);
    expect(chatIsSearchableQuery(" a ")).toBe(false);
    expect(chatIsSearchableQuery("ab")).toBe(true);
    expect(chatIsSearchableQuery("x".repeat(100))).toBe(true);
    expect(chatIsSearchableQuery("x".repeat(101))).toBe(false);
    expect(chatSearchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(
      chatSearchQuerySchema.safeParse({ q: "ab", before: "12" }).data,
    ).toEqual({ q: "ab", before: 12 });
  });

  it("builds a snippet with the match as written and ellipses where cut", () => {
    const text = `${"a".repeat(60)}MATCH${"b".repeat(60)}`;
    const snippet = chatBuildSnippet(text, { start: 60, end: 65 });

    expect(snippet).toEqual({
      before: `…${"a".repeat(40)}`,
      match: "MATCH",
      after: `${"b".repeat(40)}…`,
    });
    expect(chatBuildSnippet("ab\ncd", { start: 0, end: 2 }).after).toBe(" cd");
  });
});

describe("slash commands", () => {
  it("strips a leading /imlang and marks the message silent", () => {
    expect(chatParseCommand("/imlang  hi there ")).toMatchObject({
      body: "hi there",
      effects: { silent: true },
    });
    expect(chatParseCommand("/IMLANG hi").effects.silent).toBe(true);
    expect(chatParseCommand("/imlang").body).toBe("");
  });

  it("keeps anything else as plain text", () => {
    for (const text of ["/other hi", "hi /imlang", "/imlanghi", " /imlang x"]) {
      expect(chatParseCommand(text).effects).toEqual({});
    }
    expect(chatParseCommand("  hello ").body).toBe("hello");
  });
});

describe("links", () => {
  it("finds http(s) and www URLs without trailing punctuation", () => {
    expect(
      chatExtractUrls("xem https://example.com/a, và www.example.org/b.").map(
        (u) => u.href,
      ),
    ).toEqual(["https://example.com/a", "https://www.example.org/b"]);
    expect(chatExtractUrls("(https://example.com/c)")[0].text).toBe(
      "https://example.com/c",
    );
    expect(chatExtractUrls("https://en.wikipedia.org/wiki/A_(b)")[0].text).toBe(
      "https://en.wikipedia.org/wiki/A_(b)",
    );
  });

  it("ignores look-alikes and repeats", () => {
    expect(
      chatExtractUrls("xhttp://a.com javascript:alert(1) https://localhost/x"),
    ).toEqual([]);
    expect(chatExtractUrls("https://a.com/x https://a.com/x")).toHaveLength(1);
    expect(chatExtractUrls("https://user:pw@a.com/x")).toEqual([]);
  });
});

describe("read cursor", () => {
  it("only moves forward and never past the last message", () => {
    expect(chatNextReadCursor(5, 3, 10)).toBe(5);
    expect(chatNextReadCursor(5, 8, 10)).toBe(8);
    expect(chatNextReadCursor(5, 99, 10)).toBe(10);
    expect(chatNextReadCursor(5, -1, 10)).toBe(5);
    expect(chatNextReadCursor(5, 1.5, 10)).toBe(5);
    expect(chatNextReadCursor(5, Number.NaN, 10)).toBe(5);
  });
});

describe("nicknames", () => {
  it("maps the viewer's aliases to conversation keys", () => {
    const aliases = new Map([
      ["user:7", "Mai"],
      ["pt", "Thầy"],
      ["admin:2", "Hoàn"],
      ["admin:3", "  "],
      ["user:99", "Lạ"],
      ["admin:1", "Tôi"],
    ]);

    expect(
      chatAliasesToNicknames(aliases, {
        viewerKey: "admin:1",
        traineeUserId: 7,
      }),
    ).toEqual({
      user: "Mai",
      pt: "Thầy",
      "admin:2": "Hoàn",
    });
  });
});

describe("photo check", () => {
  const png = (width: number, height: number) => {
    const bytes = new Uint8Array(40);

    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return bytes;
  };

  it("reads type and size from the bytes", () => {
    expect(chatCheckPhoto(png(300, 200))).toEqual({
      ok: true,
      mime: "image/png",
      width: 300,
      height: 200,
    });
  });

  it("rejects empty, huge, oversize-side and unknown files", () => {
    expect(chatCheckPhoto(new Uint8Array())).toEqual({
      ok: false,
      error: "empty",
    });
    expect(chatCheckPhoto(new Uint8Array(CHAT_PHOTO_MAX_BYTES + 1))).toEqual({
      ok: false,
      error: "too_large",
    });
    expect(chatCheckPhoto(png(1601, 10))).toEqual({
      ok: false,
      error: "bad_image",
    });
    expect(chatCheckPhoto(png(0, 10))).toEqual({
      ok: false,
      error: "bad_image",
    });
    expect(
      chatCheckPhoto(new TextEncoder().encode("GIF89a0000000000000")),
    ).toEqual({ ok: false, error: "bad_image" });
  });

  it("limits a personal sticker to PNG or WebP of 150 KB", () => {
    expect(stickerCheckImage(png(10, 10))).toEqual({
      ok: true,
      mime: "image/png",
    });
    expect(stickerCheckImage(new Uint8Array(150 * 1024 + 1))).toEqual({
      ok: false,
      error: "too_large",
    });
    expect(
      stickerCheckImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])),
    ).toEqual({ ok: false, error: "bad_image" });
  });
});

describe("stickers", () => {
  it("looks up bundled stickers by own property only", () => {
    expect(findBundledSticker("fluent", "fire")).toEqual({
      pack: "fluent",
      id: "fire",
      alt: "Lửa",
      url: "/stickers/fluent/fire.svg",
    });
    expect(findBundledSticker("fluent", "constructor")).toBeNull();
    expect(findBundledSticker("__proto__", "fire")).toBeNull();
    expect(findBundledSticker("other", "fire")).toBeNull();
  });

  it("validates sticker input: bundled, GIPHY on its media hosts, personal id", () => {
    const ok = [
      { pack: "fluent", id: "fire" },
      {
        giphyId: "abc123",
        url: "https://media0.giphy.com/media/abc123/giphy.gif",
      },
      { customId: 4 },
    ];
    const bad = [
      { pack: "fluent", id: "nope" },
      { giphyId: "abc123", url: "https://media.giphy.com.evil.com/abc123.gif" },
      { giphyId: "abc123", url: "http://media.giphy.com/abc123.gif" },
      { giphyId: "abc123", url: "https://media.giphy.com:8443/abc123.gif" },
      {
        giphyId: "abc123",
        url: "https://media.giphy.com/media/other/giphy.gif",
      },
      { giphyId: "ab", url: "https://media.giphy.com/ab.gif" },
      { customId: 0 },
      { customId: 1.5 },
      {},
    ];

    ok.forEach((value) =>
      expect(stickerInputSchema.safeParse(value).success).toBe(true),
    );
    bad.forEach((value) =>
      expect(
        stickerInputSchema.safeParse(value).success,
        JSON.stringify(value),
      ).toBe(false),
    );
  });

  it("stores and reads stickers round trip", () => {
    const stored = stickerToStored({ customId: 12 }, customUrl);

    expect(stored).toEqual({
      stickerRef: "custom:12",
      stickerUrl: "/v1/chat/stickers/custom/12",
    });
    expect(
      stickerToView(stored.stickerRef, stored.stickerUrl, customUrl)?.kind,
    ).toBe("custom");
    const pack = stickerToStored({ pack: "fluent", id: "fire" }, customUrl);

    expect(pack).toEqual({
      stickerRef: "pack:fire",
      stickerUrl: "/stickers/fluent/fire.svg",
    });
    expect(stickerToView(pack.stickerRef, pack.stickerUrl, customUrl)).toEqual({
      kind: "pack",
      url: "/stickers/fluent/fire.svg",
      alt: "Lửa",
    });
    expect(
      stickerToView("pack:fire", "/stickers/other/fire.svg", customUrl),
    ).toBeNull();
    expect(stickerToView("weird:1", "/x", customUrl)).toBeNull();
    expect(stickerToView(null, null, customUrl)).toBeNull();
  });

  it("reduces a GIPHY response to the picker fields", () => {
    const stickers = stickerMapGiphyResponse({
      data: [
        {
          id: "abc123",
          title: " Hi ",
          images: { fixed_width: { url: "https://media1.giphy.com/a.gif" } },
        },
        {
          id: "bad id",
          images: { fixed_width: { url: "https://media1.giphy.com/a.gif" } },
        },
        {
          id: "evil99",
          images: { fixed_width: { url: "https://evil.com/a.gif" } },
        },
      ],
    });

    expect(stickers).toEqual([
      {
        giphyId: "abc123",
        url: "https://media1.giphy.com/a.gif",
        previewUrl: "https://media1.giphy.com/a.gif",
        alt: "Hi",
      },
    ]);
    expect(stickerMapGiphyResponse(null)).toEqual([]);
    expect(stickerMapGiphyResponse({ data: "x" })).toEqual([]);
  });

  it("normalises a GIPHY query and refuses one over the limit", () => {
    expect(stickerNormalizeGiphyQuery("  a\tb\n c ", 50)).toBe("a b c");
    expect(stickerNormalizeGiphyQuery(undefined, 50)).toBe("");
    expect(stickerNormalizeGiphyQuery("x".repeat(51), 50)).toBeNull();
    expect(stickerNormalizeGiphyQuery("😀".repeat(50), 50)).toBe(
      "😀".repeat(50),
    );
  });
});

describe("request schemas", () => {
  it("accepts text or a photo or a sticker alone", () => {
    const parse = (value: object) =>
      chatSendMessageRequestSchema.safeParse(value).success;

    expect(parse({ body: " hi " })).toBe(true);
    expect(parse({ photoId: 3 })).toBe(true);
    expect(parse({ body: "caption", photoId: 3 })).toBe(true);
    expect(parse({ sticker: { pack: "fluent", id: "fire" } })).toBe(true);
    expect(parse({})).toBe(false);
    expect(parse({ body: "hi", sticker: { customId: 1 } })).toBe(false);
    expect(parse({ photoId: 3, sticker: { customId: 1 } })).toBe(false);
    expect(parse({ body: "  " })).toBe(false);
    expect(parse({ body: "hi", clientId: "nope" })).toBe(false);
  });

  it("allows one of after, before, around and coerces the polling flags", () => {
    expect(
      chatThreadQuerySchema.safeParse({
        after: "5",
        readUpTo: "0",
        enabled: "1",
        changedSince: "123",
      }).data,
    ).toEqual({
      after: 5,
      readUpTo: 0,
      enabled: true,
      changedSince: 123,
    });
    expect(
      chatThreadQuerySchema.safeParse({ after: "1", before: "2" }).success,
    ).toBe(false);
    expect(
      chatThreadQuerySchema.safeParse({ before: "2", around: "3" }).success,
    ).toBe(false);
    expect(chatThreadQuerySchema.safeParse({ enabled: "yes" }).success).toBe(
      false,
    );
    expect(chatThreadQuerySchema.safeParse({ before: "0" }).success).toBe(
      false,
    );
  });
});
