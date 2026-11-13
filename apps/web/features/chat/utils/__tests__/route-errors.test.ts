import { describe, expect, it } from "vitest";

import { routeErrorKey } from "@/features/chat/utils/route-errors";

describe("routeErrorKey", () => {
  it("keeps the keys the chat client has always read", () => {
    expect(routeErrorKey("CHAT_LOCKED", 403)).toBe("chat_locked");
    expect(routeErrorKey("PHOTO_TOO_LARGE", 413)).toBe("too_large");
    expect(routeErrorKey("BAD_IMAGE", 400)).toBe("bad_image");
    expect(routeErrorKey("RATE_LIMITED", 429)).toBe("rate_limited");
    expect(routeErrorKey("GIPHY_UNAVAILABLE", 502)).toBe("giphy_unavailable");
    expect(routeErrorKey("STICKER_LIMIT", 409)).toBe("limit");
  });

  it("falls back to the status", () => {
    expect(routeErrorKey("SESSION_INVALID", 401)).toBe("unauthorized");
    expect(routeErrorKey("CONVERSATION_NOT_FOUND", 404)).toBe("not_found");
    expect(routeErrorKey("WHATEVER", 413)).toBe("too_large");
    expect(routeErrorKey("OTHER", 403)).toBe("forbidden");
    expect(routeErrorKey("API_UNREACHABLE", 502)).toBe("failed");
    expect(routeErrorKey("MESSAGE_UNSENT", 409)).toBe("message_unsent");
  });
});
