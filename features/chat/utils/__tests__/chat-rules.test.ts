import { describe, expect, it } from "vitest";

import {
  adminReaderKey,
  CHAT_NICKNAME_MAX_LENGTH,
  CHAT_PAGE_SIZE,
  colorSchema,
  historyCursorSchema,
  nextReadCursor,
  nicknameTargetSchema,
  nicknameValueSchema,
  parseAdminTarget,
  sendMessageSchema,
  toPreview,
  USER_READER_KEY,
} from "@/features/chat/utils/chat-rules";

const CLIENT_ID = "0b8f3c1e-6a4d-4f6e-9a57-2f1c8d3e4b5a";

describe("sendMessageSchema", () => {
  it("trims the body", () => {
    expect(
      sendMessageSchema.parse({ body: "  chào PT  ", clientId: CLIENT_ID }),
    ).toEqual({ body: "chào PT", clientId: CLIENT_ID });
  });

  it.each(["", "     ", "\n\t "])("rejects empty body %j", (body) => {
    expect(
      sendMessageSchema.safeParse({ body, clientId: CLIENT_ID }).success,
    ).toBe(false);
  });

  it("accepts 2000 chars and rejects 2001", () => {
    const ok = sendMessageSchema.safeParse({
      body: "a".repeat(2000),
      clientId: CLIENT_ID,
    });
    const tooLong = sendMessageSchema.safeParse({
      body: "a".repeat(2001),
      clientId: CLIENT_ID,
    });

    expect(ok.success).toBe(true);
    expect(tooLong.success).toBe(false);
  });

  it("counts length after trimming", () => {
    const result = sendMessageSchema.safeParse({
      body: ` ${"a".repeat(2000)} `,
      clientId: CLIENT_ID,
    });

    expect(result.success).toBe(true);
  });

  it.each(["", "not-a-uuid", "123"])("rejects clientId %j", (clientId) => {
    expect(sendMessageSchema.safeParse({ body: "hi", clientId }).success).toBe(
      false,
    );
  });
});

describe("reader keys and page size", () => {
  it("builds the keys stored in chat_reads", () => {
    expect(USER_READER_KEY).toBe("user");
    expect(adminReaderKey(7)).toBe("admin:7");
    expect(CHAT_PAGE_SIZE).toBe(30);
  });
});

describe("historyCursorSchema", () => {
  it("accepts nothing, after, or before", () => {
    expect(historyCursorSchema.parse({})).toEqual({});
    expect(historyCursorSchema.parse({ after: "12" })).toEqual({ after: 12 });
    expect(historyCursorSchema.parse({ before: 5 })).toEqual({ before: 5 });
  });

  it("rejects both at once", () => {
    expect(historyCursorSchema.safeParse({ after: 1, before: 2 }).success).toBe(
      false,
    );
  });

  it.each(["0", "-1", "1.5", "abc", ""])("rejects %j", (value) => {
    expect(historyCursorSchema.safeParse({ after: value }).success).toBe(false);
    expect(historyCursorSchema.safeParse({ before: value }).success).toBe(
      false,
    );
  });
});

describe("nextReadCursor", () => {
  it("moves forward", () => {
    expect(nextReadCursor(3, 8, 10)).toBe(8);
  });

  it("never moves backwards", () => {
    expect(nextReadCursor(8, 3, 10)).toBe(8);
  });

  it("never goes beyond the last message", () => {
    expect(nextReadCursor(3, 99, 10)).toBe(10);
  });

  it("ignores bad input", () => {
    expect(nextReadCursor(4, Number.NaN, 10)).toBe(4);
    expect(nextReadCursor(4, -2, 10)).toBe(4);
    expect(nextReadCursor(4, 1.5, 10)).toBe(4);
    expect(nextReadCursor(4, Infinity, 10)).toBe(4);
    expect(nextReadCursor(4, 6, Number.NaN)).toBe(4);
  });

  it("stays at 0 for an empty conversation", () => {
    expect(nextReadCursor(0, 5, 0)).toBe(0);
  });
});

describe("nickname and colour schemas", () => {
  it("accepts the three target kinds only", () => {
    for (const target of ["user", "pt", "admin:7"]) {
      expect(nicknameTargetSchema.safeParse(target).success).toBe(true);
    }
    for (const target of ["", "admin", "admin:0", "admin:-1", "Admin:1", "x"]) {
      expect(nicknameTargetSchema.safeParse(target).success).toBe(false);
    }
  });

  it("parses admin targets", () => {
    expect(parseAdminTarget("admin:12")).toBe(12);
    expect(parseAdminTarget("user")).toBeNull();
  });

  it("trims and collapses nicknames, empty clears, 30 characters max", () => {
    expect(nicknameValueSchema.parse("  a   b ")).toBe("a b");
    expect(nicknameValueSchema.parse("   ")).toBe("");
    expect(
      nicknameValueSchema.safeParse("x".repeat(CHAT_NICKNAME_MAX_LENGTH))
        .success,
    ).toBe(true);
    expect(
      nicknameValueSchema.safeParse("x".repeat(CHAT_NICKNAME_MAX_LENGTH + 1))
        .success,
    ).toBe(false);
    // Emoji are one character each, not two UTF-16 units.
    expect(
      nicknameValueSchema.safeParse("💪".repeat(CHAT_NICKNAME_MAX_LENGTH))
        .success,
    ).toBe(true);
    expect(nicknameValueSchema.safeParse("a\nb").success).toBe(true);
    expect(nicknameValueSchema.safeParse("a\u0007b").success).toBe(false);
  });

  it("accepts palette keys and null, nothing else", () => {
    expect(colorSchema.safeParse({ color: "blue" }).success).toBe(true);
    expect(colorSchema.safeParse({ color: null }).success).toBe(true);
    expect(colorSchema.safeParse({ color: "#fff" }).success).toBe(false);
    expect(colorSchema.safeParse({}).success).toBe(false);
  });
});

describe("toPreview", () => {
  it("keeps short bodies as they are", () => {
    expect(toPreview("xin chào")).toBe("xin chào");
  });

  it("cuts at 80 characters", () => {
    expect(toPreview("a".repeat(120))).toBe("a".repeat(80));
  });

  it("does not split a multi-code-unit character", () => {
    expect(toPreview("💪".repeat(100))).toBe("💪".repeat(80));
  });
});
