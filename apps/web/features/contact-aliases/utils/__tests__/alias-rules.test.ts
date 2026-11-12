import { describe, expect, it } from "vitest";

import {
  ALIAS_MAX_LENGTH,
  aliasesToConversationNicknames,
  aliasValueSchema,
  canSaveAlias,
  checkAliasTarget,
  conversationKeyToTarget,
  mapLegacyNickname,
  overlayName,
  parseActorRef,
  setAliasInputSchema,
} from "@/features/contact-aliases/utils/alias-rules";

describe("parseActorRef", () => {
  it("parses user and admin keys", () => {
    expect(parseActorRef("user:12")).toEqual({ kind: "user", id: 12 });
    expect(parseActorRef("admin:7")).toEqual({ kind: "admin", id: 7 });
  });

  it.each([
    "",
    "user",
    "user:",
    "user:0",
    "user:-3",
    "user:1.5",
    "user:1:2",
    "User:1",
    "pt",
    "admin:abc",
    "admin:0123",
  ])("rejects %j", (key) => {
    expect(parseActorRef(key)).toBeNull();
  });
});

describe("aliasValueSchema", () => {
  it("trims and collapses whitespace; empty clears", () => {
    expect(aliasValueSchema.parse("  a   b ")).toBe("a b");
    expect(aliasValueSchema.parse("   ")).toBe("");
  });

  it("allows exactly the max length by characters, not bytes or UTF-16 units", () => {
    expect(
      aliasValueSchema.safeParse("ê".repeat(ALIAS_MAX_LENGTH)).success,
    ).toBe(true);
    expect(
      aliasValueSchema.safeParse("ê".repeat(ALIAS_MAX_LENGTH + 1)).success,
    ).toBe(false);
    expect(
      aliasValueSchema.safeParse("💪".repeat(ALIAS_MAX_LENGTH)).success,
    ).toBe(true);
  });

  it("rejects control characters and non-strings", () => {
    expect(aliasValueSchema.safeParse("a\u0007b").success).toBe(false);
    expect(aliasValueSchema.safeParse("a\u0000b").success).toBe(false);
    expect(aliasValueSchema.safeParse(5).success).toBe(false);
    expect(aliasValueSchema.safeParse(null).success).toBe(false);
  });
});

describe("setAliasInputSchema", () => {
  it("accepts an actor key or the PT side as target", () => {
    for (const targetKey of ["user:3", "admin:9", "pt"]) {
      expect(
        setAliasInputSchema.safeParse({ targetKey, alias: "x" }).success,
      ).toBe(true);
    }
  });

  it.each([
    ["conversation key", { targetKey: "user", alias: "x" }],
    ["unknown target", { targetKey: "everyone", alias: "x" }],
    ["admin without id", { targetKey: "admin:", alias: "x" }],
    ["id zero", { targetKey: "user:0", alias: "x" }],
    ["too long", { targetKey: "user:1", alias: "x".repeat(31) }],
    ["control characters", { targetKey: "user:1", alias: "a\u0000b" }],
    ["owner field is ignored, not accepted as input", undefined],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(setAliasInputSchema.safeParse(input).success).toBe(false);
  });

  it("never carries an owner: extra fields are dropped", () => {
    const parsed = setAliasInputSchema.parse({
      targetKey: "user:3",
      alias: "x",
      ownerKey: "admin:1",
    });

    expect(parsed).toEqual({ targetKey: "user:3", alias: "x" });
  });
});

describe("checkAliasTarget", () => {
  it("allows another person", () => {
    expect(checkAliasTarget("user:1", "user:2")).toBe("ok");
    expect(checkAliasTarget("user:1", "admin:1")).toBe("ok");
    expect(checkAliasTarget("admin:1", "user:1")).toBe("ok");
    expect(checkAliasTarget("admin:1", "admin:2")).toBe("ok");
  });

  it("rejects naming yourself", () => {
    expect(checkAliasTarget("user:1", "user:1")).toBe("self");
    expect(checkAliasTarget("admin:4", "admin:4")).toBe("self");
  });

  it("allows the PT side for a trainee only", () => {
    expect(checkAliasTarget("user:1", "pt")).toBe("ok");
    expect(checkAliasTarget("admin:1", "pt")).toBe("pt-not-allowed");
  });

  it("rejects malformed keys", () => {
    expect(checkAliasTarget("user:1", "user")).toBe("invalid");
    expect(checkAliasTarget("nobody", "user:1")).toBe("invalid");
    expect(checkAliasTarget("nobody", "pt")).toBe("invalid");
  });
});

describe("canSaveAlias", () => {
  it("is off when nothing changed", () => {
    expect(canSaveAlias("Bé Na", "Bé Na")).toBe(false);
    expect(canSaveAlias("  ", undefined)).toBe(false);
  });

  it("is on for a new, changed or cleared nickname", () => {
    expect(canSaveAlias("Bé Na", undefined)).toBe(true);
    expect(canSaveAlias("Na", "Bé Na")).toBe(true);
    expect(canSaveAlias("", "Bé Na")).toBe(true);
  });

  it("is off over the limit and counts code points", () => {
    expect(canSaveAlias("a".repeat(31), undefined)).toBe(false);
    expect(canSaveAlias("💪".repeat(30), undefined)).toBe(true);
  });
});

describe("overlayName", () => {
  const aliases = new Map([
    ["user:2", "Bé Na"],
    ["user:3", "   "],
  ]);

  it("shows the viewer's alias, else the real name", () => {
    expect(overlayName(aliases, "user:2", "Na")).toBe("Bé Na");
    expect(overlayName(aliases, "user:9", "Cúc")).toBe("Cúc");
  });

  it("treats blank aliases and a missing map as no alias", () => {
    expect(overlayName(aliases, "user:3", "Lan")).toBe("Lan");
    expect(overlayName(null, "user:2", "Na")).toBe("Na");
    expect(overlayName(undefined, "user:2", "Na")).toBe("Na");
  });
});

describe("aliasesToConversationNicknames", () => {
  const aliases = new Map([
    ["user:5", "Bé Na"],
    ["pt", "Thầy"],
    ["admin:2", "Thầy Hai"],
    ["user:9", "Someone else's trainee"],
    ["admin:1", "Myself"],
  ]);

  it("translates the viewer's aliases into the conversation's keys", () => {
    expect(
      aliasesToConversationNicknames(aliases, {
        viewerKey: "admin:3",
        traineeUserId: 5,
      }),
    ).toEqual({
      user: "Bé Na",
      pt: "Thầy",
      "admin:2": "Thầy Hai",
      "admin:1": "Myself",
    });
  });

  it("never aliases the viewer themselves", () => {
    expect(
      aliasesToConversationNicknames(aliases, {
        viewerKey: "admin:1",
        traineeUserId: 5,
      }),
    ).not.toHaveProperty("admin:1");
    expect(
      aliasesToConversationNicknames(aliases, {
        viewerKey: "user:5",
        traineeUserId: 5,
      }),
    ).not.toHaveProperty("user");
  });

  it("drops other trainees and blank aliases", () => {
    const result = aliasesToConversationNicknames(
      new Map([
        ["user:9", "x"],
        ["admin:2", "  "],
      ]),
      { viewerKey: "user:5", traineeUserId: 5 },
    );

    expect(result).toEqual({});
  });
});

describe("conversationKeyToTarget", () => {
  it("maps the conversation's trainee key to the global key", () => {
    expect(conversationKeyToTarget("user", 8)).toBe("user:8");
    expect(conversationKeyToTarget("pt", 8)).toBe("pt");
    expect(conversationKeyToTarget("admin:2", 8)).toBe("admin:2");
  });
});

describe("mapLegacyNickname (KAN-141 -> private aliases)", () => {
  const row = (
    targetKey: string,
    setByKey: string,
    nickname = "Biệt danh",
    conversationUserId = 7,
  ) => ({ targetKey, setByKey, nickname, conversationUserId });

  it("makes the trainee's nickname for the PT side theirs", () => {
    expect(mapLegacyNickname(row("pt", "user"))).toEqual({
      ownerKey: "user:7",
      targetKey: "pt",
      alias: "Biệt danh",
    });
  });

  it("maps 'user' to the conversation's trainee on either end", () => {
    expect(mapLegacyNickname(row("user", "admin:2"))).toEqual({
      ownerKey: "admin:2",
      targetKey: "user:7",
      alias: "Biệt danh",
    });
    expect(mapLegacyNickname(row("admin:2", "user"))).toEqual({
      ownerKey: "user:7",
      targetKey: "admin:2",
      alias: "Biệt danh",
    });
  });

  it("keeps admin-to-admin nicknames", () => {
    expect(mapLegacyNickname(row("admin:3", "admin:2"))).toEqual({
      ownerKey: "admin:2",
      targetKey: "admin:3",
      alias: "Biệt danh",
    });
  });

  it("skips people who named themselves", () => {
    expect(mapLegacyNickname(row("user", "user"))).toBeNull();
    expect(mapLegacyNickname(row("admin:2", "admin:2"))).toBeNull();
  });

  it("skips what cannot be a private alias", () => {
    // An admin naming the PT side as a whole has no meaning.
    expect(mapLegacyNickname(row("pt", "admin:2"))).toBeNull();
    expect(mapLegacyNickname(row("everyone", "user"))).toBeNull();
    expect(mapLegacyNickname(row("user", "nobody"))).toBeNull();
    expect(mapLegacyNickname(row("pt", "user", "   "))).toBeNull();
    expect(mapLegacyNickname(row("pt", "user", "x".repeat(31)))).toBeNull();
  });

  it("normalises the stored value", () => {
    expect(mapLegacyNickname(row("pt", "user", "  Big   Coach "))?.alias).toBe(
      "Big Coach",
    );
  });
});
