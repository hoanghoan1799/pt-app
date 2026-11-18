import { describe, expect, it } from "vitest";

import {
  FRIEND_MESSAGES,
  REPORT_REASON_CODES,
} from "@/features/social/constants/social";
import {
  pairOf,
  parseSearchEmail,
  reportSchema,
  resolveReportSchema,
} from "@/features/social/utils/friend-rules";

describe("pairOf", () => {
  it("orders a pair the same way both ways", () => {
    expect(pairOf(7, 3)).toEqual({ low: 3, high: 7 });
    expect(pairOf(3, 7)).toEqual({ low: 3, high: 7 });
  });
});

describe("parseSearchEmail", () => {
  it("trims and lower-cases a full address", () => {
    expect(parseSearchEmail("  An@Mail.COM ")).toBe("an@mail.com");
  });

  it.each(["", "an", "an@", "@mail.com", "an@mail", "a b@mail.com", 5, null])(
    "rejects %j",
    (value) => {
      expect(parseSearchEmail(value)).toBeNull();
    },
  );
});

describe("reportSchema reason code", () => {
  it("requires one of the fixed reason codes for every kind", () => {
    for (const targetKind of ["post", "comment", "user", "message"]) {
      const parsed = reportSchema.safeParse({ targetKind, targetId: 1 });

      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0].message).toBe(
        FRIEND_MESSAGES.REASON_REQUIRED,
      );
      expect(
        reportSchema.safeParse({ targetKind, targetId: 1, reasonCode: "scam" })
          .success,
      ).toBe(true);
    }
    expect(
      reportSchema.safeParse({
        targetKind: "message",
        targetId: 1,
        reasonCode: "rude",
      }).success,
    ).toBe(false);
  });

  it("takes every code of the list and the hidden resolution", () => {
    for (const reasonCode of REPORT_REASON_CODES) {
      expect(
        reportSchema.parse({ targetKind: "message", targetId: 4, reasonCode })
          .reasonCode,
      ).toBe(reasonCode);
    }
    expect(
      resolveReportSchema.safeParse({ reportId: 1, resolution: "hidden" })
        .success,
    ).toBe(true);
    expect(
      resolveReportSchema.safeParse({ reportId: 1, resolution: "x" }).success,
    ).toBe(false);
  });
});

describe("reportSchema", () => {
  it("defaults the reason to empty and trims it", () => {
    expect(
      reportSchema.parse({
        targetKind: "post",
        targetId: 1,
        reasonCode: "spam",
      }).reason,
    ).toBe("");
    expect(
      reportSchema.parse({
        targetKind: "user",
        targetId: 1,
        reasonCode: "other",
        reason: " x ",
      }).reason,
    ).toBe("x");
  });

  it("caps the reason at 500 characters and checks kind and id", () => {
    const base = { targetKind: "post", targetId: 1, reasonCode: "spam" };

    expect(
      reportSchema.safeParse({ ...base, reason: "x".repeat(500) }).success,
    ).toBe(true);
    expect(
      reportSchema.safeParse({ ...base, reason: "x".repeat(501) }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({ ...base, targetKind: "admin" }).success,
    ).toBe(false);
    expect(reportSchema.safeParse({ ...base, targetId: 0 }).success).toBe(
      false,
    );
  });
});
