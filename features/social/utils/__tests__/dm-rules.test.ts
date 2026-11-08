import { describe, expect, it } from "vitest";

import { TERMS_VERSION } from "@/features/social/constants/social";
import {
  buildDmPushPayload,
  checkDmContent,
  dmAccessOf,
  dmPreview,
  otherMember,
  parseDmId,
  sendBlockReason,
} from "@/features/social/utils/dm-rules";

const members = { low: 3, high: 8 };
const okState = {
  areFriends: true,
  isBlocked: false,
  viewerAcceptedTerms: true,
  otherAcceptedTerms: true,
};

describe("dmAccessOf", () => {
  it("lets the two members in, unless a block hides the chat", () => {
    expect(dmAccessOf({ kind: "user", id: 3 }, members, false)).toBe("member");
    expect(dmAccessOf({ kind: "user", id: 8 }, members, false)).toBe("member");
    expect(dmAccessOf({ kind: "user", id: 8 }, members, true)).toBe("none");
    expect(dmAccessOf({ kind: "user", id: 4 }, members, false)).toBe("none");
  });

  it("gives a super admin read-only access and a PT none", () => {
    expect(
      dmAccessOf({ kind: "admin", id: 1, role: "super_admin" }, members, true),
    ).toBe("readonly_admin");
    expect(
      dmAccessOf({ kind: "admin", id: 1, role: "pt" }, members, false),
    ).toBe("none");
  });
});

describe("sendBlockReason", () => {
  it("allows friends who both accepted the terms", () => {
    expect(sendBlockReason(okState)).toBeNull();
  });

  it.each([
    { areFriends: false },
    { isBlocked: true },
    { viewerAcceptedTerms: false },
    { otherAcceptedTerms: false },
  ])("is read-only for %o", (change) => {
    expect(sendBlockReason({ ...okState, ...change })).toEqual(
      expect.any(String),
    );
  });

  it("uses the current terms version constant", () => {
    expect(TERMS_VERSION).toBeGreaterThan(0);
  });
});

describe("checkDmContent", () => {
  it("trims text, needs text or a photo and caps the length", () => {
    expect(checkDmContent("  hi ", null)).toEqual({ ok: true, body: "hi" });
    expect(checkDmContent("  ", 5)).toEqual({ ok: true, body: null });
    expect(checkDmContent(" ", null).ok).toBe(false);
    expect(checkDmContent("a".repeat(2000), null).ok).toBe(true);
    expect(checkDmContent("a".repeat(2001), null).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("parses ids strictly", () => {
    expect(parseDmId("12")).toBe(12);
    expect(parseDmId("0")).toBeNull();
    expect(parseDmId("1e3")).toBeNull();
    expect(parseDmId("-4")).toBeNull();
  });

  it("finds the other member", () => {
    expect(otherMember(members, 3)).toBe(8);
    expect(otherMember(members, 8)).toBe(3);
  });

  it("previews by kind", () => {
    expect(dmPreview({ body: "x", photoId: null, deleted: false })).toBe("x");
    expect(dmPreview({ body: null, photoId: 2, deleted: false })).toBe(
      "📷 Ảnh",
    );
    expect(dmPreview({ body: "x", photoId: null, deleted: true })).toBe(
      "Tin nhắn đã được thu hồi",
    );
  });

  it("builds a push without the text", () => {
    expect(
      buildDmPushPayload({ senderName: "An", conversationId: 4, photo: true }),
    ).toEqual({
      title: "PT App",
      body: "An: 📷 Ảnh",
      url: "/messages/dm/4",
      tag: "dm-4",
    });
    expect(
      buildDmPushPayload({ senderName: "An", conversationId: 4, photo: false })
        .body,
    ).toBe("An vừa nhắn tin");
  });
});
