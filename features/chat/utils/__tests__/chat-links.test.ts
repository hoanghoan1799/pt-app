import { describe, expect, it } from "vitest";

import {
  chatPaths,
  jumpHref,
  parseJumpId,
} from "@/features/chat/utils/chat-links";

describe("chatPaths", () => {
  it("has a fixed set for the trainee", () => {
    expect(chatPaths("user", 5)).toEqual({
      chat: "/messages/coach",
      info: "/messages/coach/info",
      photos: "/messages/coach/photos",
      search: "/messages/coach/search",
    });
  });

  it("has a set per trainee for the admin", () => {
    expect(chatPaths("admin", 5)).toEqual({
      chat: "/admin/users/5/messages",
      info: "/admin/users/5/messages/info",
      photos: "/admin/users/5/messages/photos",
      search: "/admin/users/5/messages/search",
    });
  });
});

describe("jumpHref / parseJumpId", () => {
  it("round-trips a message id", () => {
    const href = jumpHref("/messages/coach", 123);

    expect(href).toBe("/messages/coach?m=123");
    expect(
      parseJumpId(new URL(href, "http://x").searchParams.get("m") ?? ""),
    ).toBe(123);
  });

  it("takes the first of a repeated param and ignores junk", () => {
    expect(parseJumpId(["7", "8"])).toBe(7);
    for (const bad of [undefined, "", "0", "-1", "1e3", "abc", " 4"]) {
      expect(parseJumpId(bad)).toBeNull();
    }
  });
});
