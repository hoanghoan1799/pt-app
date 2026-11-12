import { describe, expect, it } from "vitest";

import {
  conversationIdOf,
  revokedUrl,
} from "@/features/chat/hooks/chat-socket";

describe("revokedUrl", () => {
  it("ends the session the same way the HTTP flow does", () => {
    expect(revokedUrl("user", "signed_out")).toBe("/session/end?role=user");
    expect(revokedUrl("admin", "session_expired")).toBe(
      "/session/end?role=admin",
    );
  });

  it("sends a locked admin to the passcode screen", () => {
    expect(revokedUrl("admin", "locked")).toBe("/admin/lock");
  });

  it("never sends a trainee to the admin lock", () => {
    expect(revokedUrl("user", "locked")).toBe("/session/end?role=user");
  });
});

describe("conversationIdOf", () => {
  it("reads the conversation a payload names", () => {
    expect(conversationIdOf({ conversationId: 7, messageId: 1 })).toBe(7);
  });

  it("is null for anything else", () => {
    expect(conversationIdOf({ enabled: true })).toBeNull();
    expect(conversationIdOf({ conversationId: "7" })).toBeNull();
    expect(conversationIdOf(null)).toBeNull();
  });
});
