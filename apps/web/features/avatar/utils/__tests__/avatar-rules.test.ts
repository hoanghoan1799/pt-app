import { describe, expect, it } from "vitest";

import {
  avatarKey,
  avatarUrl,
  isAvatarKind,
  toWebAvatarUrl,
} from "@/features/avatar/utils/avatar-rules";
import { squareCrop } from "@/features/avatar/utils/resize-avatar";

// The magic-byte and size checks (detectImageMime, decodeAvatarDataUrl) moved
// to the API; they are tested in apps/api/src/files/image-rules.test.ts and
// apps/api/test/avatars.e2e.test.ts.

describe("avatar urls and keys", () => {
  it("builds a versioned URL from whole seconds, or null without a photo", () => {
    expect(avatarUrl("user", 7, new Date(1_793_953_327_000))).toBe(
      "/api/avatar/user/7?v=1793953327",
    );
    expect(avatarUrl("admin", 2, null)).toBeNull();
    expect(avatarUrl("admin", 2, undefined)).toBeNull();
  });

  it("keys the thread map like nicknames", () => {
    expect(avatarKey("user", 3)).toBe("user");
    expect(avatarKey("admin", 3)).toBe("admin:3");
  });

  it("knows the two kinds", () => {
    expect(isAvatarKind("user")).toBe(true);
    expect(isAvatarKind("admin")).toBe(true);
    expect(isAvatarKind("root")).toBe(false);
  });
});

describe("toWebAvatarUrl", () => {
  it("points the API's photo URL at this app's avatar route", () => {
    expect(toWebAvatarUrl("/v1/avatars/user/7?v=1793953327")).toBe(
      "/api/avatar/user/7?v=1793953327",
    );
  });

  it("keeps a missing photo missing", () => {
    expect(toWebAvatarUrl(null)).toBeNull();
    expect(toWebAvatarUrl(undefined)).toBeNull();
  });
});

describe("squareCrop", () => {
  it("centres the square on a landscape image", () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 });
  });

  it("centres the square on a portrait image", () => {
    expect(squareCrop(200, 301)).toEqual({ sx: 0, sy: 50, side: 200 });
  });

  it("keeps a square as it is", () => {
    expect(squareCrop(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
  });
});
