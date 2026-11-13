import { describe, expect, it } from "vitest";

import { toWebUrl, webizeUrls } from "@/features/chat/utils/api-urls";

describe("toWebUrl", () => {
  it("maps the API's file paths to this app's proxies", () => {
    expect(toWebUrl("/v1/chat/photos/12")).toBe("/api/chat/photos/12");
    expect(toWebUrl("/v1/chat/stickers/custom/3")).toBe(
      "/api/chat/stickers/custom/3",
    );
    expect(toWebUrl("/v1/dm/photos/9")).toBe("/api/dm/photos/9");
    expect(toWebUrl("/v1/social/photos/4")).toBe("/api/social/photos/4");
    expect(toWebUrl("/v1/avatars/user/7?v=170")).toBe(
      "/api/avatar/user/7?v=170",
    );
  });

  it("leaves everything else alone", () => {
    expect(toWebUrl("https://media.giphy.com/media/abc/giphy.webp")).toBe(
      "https://media.giphy.com/media/abc/giphy.webp",
    );
    expect(toWebUrl("/stickers/pack/1.webp")).toBe("/stickers/pack/1.webp");
    expect(toWebUrl("hello /v1/chat/photos/1")).toBe("hello /v1/chat/photos/1");
  });
});

describe("webizeUrls", () => {
  it("maps nested strings without touching other values", () => {
    const input = {
      messages: [
        {
          id: 1,
          body: "see /v1/chat/photos/1",
          photo: { url: "/v1/chat/photos/1", width: 2, height: 3 },
          sticker: { kind: "custom", url: "/v1/chat/stickers/custom/5" },
          editedAt: null,
        },
      ],
      avatarUrl: "/v1/avatars/admin/2?v=1",
    };

    expect(webizeUrls(input)).toEqual({
      messages: [
        {
          id: 1,
          body: "see /v1/chat/photos/1",
          photo: { url: "/api/chat/photos/1", width: 2, height: 3 },
          sticker: { kind: "custom", url: "/api/chat/stickers/custom/5" },
          editedAt: null,
        },
      ],
      avatarUrl: "/api/avatar/admin/2?v=1",
    });
  });
});
