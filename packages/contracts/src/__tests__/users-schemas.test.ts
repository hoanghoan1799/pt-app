import {
  ALIAS_MAX_LENGTH,
  ALIAS_MESSAGES,
  aliasValueSchema,
  assignTraineePtRequestSchema,
  AVATAR_MAX_DATA_URL_LENGTH,
  checkAliasTarget,
  createPtRequestSchema,
  createTraineeRequestSchema,
  emailSchema,
  hideUsersRequestSchema,
  mapLegacyNickname,
  MEMBER_MESSAGES,
  parseActorRef,
  PT_MESSAGES,
  resolveDisplayName,
  setBioRequestSchema,
  setChatColorRequestSchema,
  setLocaleRequestSchema,
} from "../users/index.js";
import { describe, expect, it } from "vitest";

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

  it("counts characters, not UTF-16 units", () => {
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

  it("rejects control characters and non-strings with the alias message", () => {
    const bad = aliasValueSchema.safeParse("a\u0007b");

    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toBe(ALIAS_MESSAGES.INVALID);
    expect(aliasValueSchema.safeParse(5).success).toBe(false);
  });
});

describe("checkAliasTarget", () => {
  it("allows the PT side only for a trainee owner", () => {
    expect(checkAliasTarget("user:1", "pt")).toBe("ok");
    expect(checkAliasTarget("admin:1", "pt")).toBe("pt-not-allowed");
  });

  it("refuses yourself and malformed keys", () => {
    expect(checkAliasTarget("user:1", "user:1")).toBe("self");
    expect(checkAliasTarget("admin:1", "admin:2")).toBe("ok");
    expect(checkAliasTarget("user:1", "nobody")).toBe("invalid");
    expect(checkAliasTarget("bogus", "user:2")).toBe("invalid");
  });
});

describe("mapLegacyNickname", () => {
  const row = {
    targetKey: "pt",
    setByKey: "user",
    nickname: " Coach ",
    conversationUserId: 4,
  };

  it("turns a shared nickname into the setter's alias", () => {
    expect(mapLegacyNickname(row)).toEqual({
      ownerKey: "user:4",
      targetKey: "pt",
      alias: "Coach",
    });
    expect(
      mapLegacyNickname({
        targetKey: "user",
        setByKey: "admin:2",
        nickname: "An",
        conversationUserId: 4,
      }),
    ).toEqual({ ownerKey: "admin:2", targetKey: "user:4", alias: "An" });
  });

  it("drops rows that cannot be private aliases", () => {
    expect(mapLegacyNickname({ ...row, nickname: "   " })).toBeNull();
    expect(mapLegacyNickname({ ...row, targetKey: "user" })).toBeNull();
    expect(mapLegacyNickname({ ...row, setByKey: "admin:2" })).toBeNull();
    expect(mapLegacyNickname({ ...row, targetKey: "zzz" })).toBeNull();
  });
});

describe("resolveDisplayName", () => {
  it("prefers a non-blank alias", () => {
    expect(resolveDisplayName(" Bro ", "An")).toBe("Bro");
    expect(resolveDisplayName("  ", "An")).toBe("An");
    expect(resolveDisplayName(undefined, "An")).toBe("An");
  });
});

describe("emailSchema", () => {
  it("trims, and reports required, invalid and too long", () => {
    expect(emailSchema.parse(" a@b.co ")).toBe("a@b.co");
    expect(emailSchema.safeParse("").error?.issues[0].message).toBe(
      "Nhập email",
    );
    expect(emailSchema.safeParse("nope").error?.issues[0].message).toBe(
      "Email không hợp lệ",
    );
    expect(
      emailSchema.safeParse(`${"a".repeat(250)}@b.co`).error?.issues[0].message,
    ).toBe("Email tối đa 254 ký tự");
  });
});

describe("createTraineeRequestSchema", () => {
  it("collapses the name and keeps the PT optional", () => {
    expect(
      createTraineeRequestSchema.parse({
        name: "  Nguyen   An ",
        email: "an@x.co",
      }),
    ).toEqual({ name: "Nguyen An", email: "an@x.co" });
  });

  it("uses the member messages", () => {
    const empty = createTraineeRequestSchema.safeParse({
      name: "   ",
      email: "an@x.co",
    });
    const long = createTraineeRequestSchema.safeParse({
      name: "a".repeat(61),
      email: "an@x.co",
    });

    expect(empty.error?.issues[0].message).toBe(MEMBER_MESSAGES.NAME_REQUIRED);
    expect(long.error?.issues[0].message).toBe(MEMBER_MESSAGES.NAME_TOO_LONG);
    expect(
      createTraineeRequestSchema.safeParse({
        name: "a".repeat(60),
        email: "an@x.co",
        ptAdminId: 0,
      }).success,
    ).toBe(false);
  });
});

describe("createPtRequestSchema", () => {
  it("accepts a valid pair and trims the username", () => {
    expect(
      createPtRequestSchema.parse({
        username: " Coach.An ",
        password: "12345678",
      }),
    ).toEqual({ username: "Coach.An", password: "12345678" });
  });

  it("rejects a bad username and a short password with the PT messages", () => {
    const result = createPtRequestSchema.safeParse({
      username: "a b",
      password: "short",
    });
    const messages = result.error?.issues.map((issue) => issue.message);

    expect(messages).toEqual([
      PT_MESSAGES.USERNAME_INVALID,
      PT_MESSAGES.PASSWORD_TOO_SHORT,
    ]);
  });
});

describe("small request schemas", () => {
  it("assign allows null to clear", () => {
    expect(assignTraineePtRequestSchema.parse({ ptAdminId: null })).toEqual({
      ptAdminId: null,
    });
    expect(
      assignTraineePtRequestSchema.safeParse({ ptAdminId: -1 }).success,
    ).toBe(false);
  });

  it("hide takes 1 to 100 positive ids", () => {
    expect(hideUsersRequestSchema.safeParse({ userIds: [] }).success).toBe(
      false,
    );
    expect(hideUsersRequestSchema.safeParse({ userIds: [0] }).success).toBe(
      false,
    );
    expect(
      hideUsersRequestSchema.safeParse({
        userIds: Array.from({ length: 101 }, (_, i) => i + 1),
      }).success,
    ).toBe(false);
    expect(hideUsersRequestSchema.safeParse({ userIds: [1, 2] }).success).toBe(
      true,
    );
  });

  it("locale, colour and bio", () => {
    expect(setLocaleRequestSchema.safeParse({ locale: "zh" }).success).toBe(
      true,
    );
    expect(setLocaleRequestSchema.safeParse({ locale: "fr" }).success).toBe(
      false,
    );
    expect(setChatColorRequestSchema.parse({ color: null })).toEqual({
      color: null,
    });
    expect(setChatColorRequestSchema.safeParse({ color: "pink" }).success).toBe(
      true,
    );
    expect(
      setChatColorRequestSchema.safeParse({ color: "mauve" }).success,
    ).toBe(false);
    expect(setBioRequestSchema.parse({ bio: "  hi " })).toEqual({ bio: "hi" });
    expect(
      setBioRequestSchema.safeParse({ bio: "x".repeat(151) }).success,
    ).toBe(false);
  });

  it("derives the data URL limit from 80 KB", () => {
    expect(AVATAR_MAX_DATA_URL_LENGTH).toBe(
      Math.ceil((80 * 1024 * 4) / 3) + 64,
    );
  });
});
