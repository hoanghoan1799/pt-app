import { describe, expect, it } from "vitest";

import {
  heartbeatUrl,
  mergeLastSeen,
  peerPresenceUrl,
  presenceView,
  shortLastSeen,
  shouldRunPresence,
} from "@/features/chat/utils/presence-status";

const NOW = new Date("2026-05-10T05:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("presenceView", () => {
  it("is online with the online label under 2 minutes", () => {
    expect(presenceView(ago(119_000), NOW)).toEqual({
      online: true,
      text: "Đang hoạt động",
    });
  });

  it("shows minutes ago and is offline from 2 minutes", () => {
    expect(presenceView(ago(120_000), NOW)).toEqual({
      online: false,
      text: "Hoạt động 2 phút trước",
    });
  });

  it("shows nothing when never seen", () => {
    expect(presenceView(null, NOW)).toEqual({ online: false, text: null });
  });
});

describe("shortLastSeen", () => {
  it("drops the prefix", () => {
    expect(shortLastSeen(ago(5 * 60_000), NOW)).toBe("5 phút trước");
  });

  it("is null when online or never seen", () => {
    expect(shortLastSeen(ago(10_000), NOW)).toBeNull();
    expect(shortLastSeen(null, NOW)).toBeNull();
  });

  it("keeps the yesterday wording without the prefix", () => {
    expect(shortLastSeen(ago(24 * 3_600_000), NOW)).toBe("hôm qua");
  });
});

describe("urls", () => {
  it("builds the peer url per role", () => {
    expect(peerPresenceUrl("user", 7)).toBe("/api/presence/peer");
    expect(peerPresenceUrl("admin", 7)).toBe(
      "/api/presence/peer?as=admin&userId=7",
    );
  });

  it("builds the heartbeat url per role", () => {
    expect(heartbeatUrl("user")).toBe("/api/presence");
    expect(heartbeatUrl("admin")).toBe("/api/presence?as=admin");
  });
});

describe("mergeLastSeen", () => {
  const older = "2026-05-10T04:00:00.000Z";
  const newer = "2026-05-10T04:30:00.000Z";

  it("takes the newer reading", () => {
    expect(mergeLastSeen(new Date(older), newer)?.toISOString()).toBe(newer);
  });

  it("never goes backwards", () => {
    expect(mergeLastSeen(new Date(newer), older)?.toISOString()).toBe(newer);
  });

  it("ignores missing or invalid input", () => {
    expect(mergeLastSeen(new Date(newer), undefined)?.toISOString()).toBe(
      newer,
    );
    expect(mergeLastSeen(null, "nope")).toBeNull();
    expect(mergeLastSeen(null, newer)?.toISOString()).toBe(newer);
  });
});

describe("shouldRunPresence", () => {
  it("runs only while visible", () => {
    expect(shouldRunPresence("visible")).toBe(true);
    expect(shouldRunPresence("hidden")).toBe(false);
  });
});
