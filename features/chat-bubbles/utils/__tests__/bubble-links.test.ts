import { describe, expect, it } from "vitest";

import {
  adminKeyUserId,
  bubbleHrefs,
  bubbleKeyFor,
  chatPathForKey,
  isEmbedParam,
  isKeyForRole,
  isLeavingChat,
  safeNavigateHref,
} from "@/features/chat-bubbles/utils/bubble-links";

describe("bubble keys and hrefs", () => {
  it("builds keys per role", () => {
    expect(bubbleKeyFor("user", 5)).toBe("coach");
    expect(bubbleKeyFor("admin", 5)).toBe("user:5");
    expect(adminKeyUserId("user:5")).toBe(5);
    expect(adminKeyUserId("coach")).toBeNull();
    expect(adminKeyUserId("user:0")).toBeNull();
  });

  it("accepts only keys that belong to the role", () => {
    expect(isKeyForRole("user", "coach")).toBe(true);
    expect(isKeyForRole("user", "user:1")).toBe(false);
    expect(isKeyForRole("admin", "user:1")).toBe(true);
    expect(isKeyForRole("admin", "coach")).toBe(false);
    expect(isKeyForRole("admin", 4)).toBe(false);
  });

  it("gives the full and the embed URL of the chat", () => {
    expect(bubbleHrefs("user", "coach")).toEqual({
      href: "/messages/coach",
      embedHref: "/messages/coach?embed=1",
    });
    expect(bubbleHrefs("admin", "user:7")).toEqual({
      href: "/admin/users/7/messages",
      embedHref: "/admin/users/7/messages?embed=1",
    });
    expect(bubbleHrefs("admin", "coach")).toBeNull();
    expect(chatPathForKey("admin", "bad")).toBeNull();
  });

  it("reads the embed param", () => {
    expect(isEmbedParam("1")).toBe(true);
    expect(isEmbedParam(["1", "0"])).toBe(true);
    expect(isEmbedParam("0")).toBe(false);
    expect(isEmbedParam(undefined)).toBe(false);
  });
});

describe("leaving the chat", () => {
  const origin = "http://localhost:3000";

  it("hands over other same-origin pages only", () => {
    expect(isLeavingChat("/workouts", "/messages/coach", origin)).toBe(true);
    expect(
      isLeavingChat("/messages/coach?m=5", "/messages/coach", origin),
    ).toBe(false);
    expect(
      isLeavingChat("https://evil.example/x", "/messages/coach", origin),
    ).toBe(false);
  });

  it("follows plain in-app paths only", () => {
    expect(safeNavigateHref("/workouts?x=1")).toBe("/workouts?x=1");
    expect(safeNavigateHref("//evil.example")).toBeNull();
    expect(safeNavigateHref("https://evil.example")).toBeNull();
    expect(safeNavigateHref(3)).toBeNull();
  });
});
