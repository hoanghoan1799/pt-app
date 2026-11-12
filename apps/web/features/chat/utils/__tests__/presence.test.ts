import { describe, expect, it } from "vitest";

import {
  formatLastSeen,
  isOnline,
  latestSeen,
  parseLastSeen,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_ONLINE_MS,
  serializeLastSeen,
} from "@/features/chat/utils/presence";

const TZ = "Asia/Ho_Chi_Minh";
// 2026-11-05 10:00 in Ho Chi Minh (UTC+7).
const NOW = new Date("2026-11-05T03:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("presence constants", () => {
  it("beats every minute and stays online for two", () => {
    expect(PRESENCE_HEARTBEAT_MS).toBe(60_000);
    expect(PRESENCE_ONLINE_MS).toBe(120_000);
  });
});

describe("isOnline", () => {
  it("is online at 119 s and offline at 120 s", () => {
    expect(isOnline(ago(119 * SECOND), NOW)).toBe(true);
    expect(isOnline(ago(120 * SECOND), NOW)).toBe(false);
  });

  it("is offline when never seen", () => {
    expect(isOnline(null, NOW)).toBe(false);
  });
});

describe("formatLastSeen", () => {
  it("returns null when never seen", () => {
    expect(formatLastSeen(null, NOW, TZ)).toBeNull();
  });

  it("says online at 119 s and minutes at 120 s", () => {
    expect(formatLastSeen(ago(119 * SECOND), NOW, TZ)).toBe("Đang hoạt động");
    expect(formatLastSeen(ago(120 * SECOND), NOW, TZ)).toBe(
      "Hoạt động 2 phút trước",
    );
  });

  it("switches from minutes to hours at 60 minutes", () => {
    expect(formatLastSeen(ago(59 * MINUTE), NOW, TZ)).toBe(
      "Hoạt động 59 phút trước",
    );
    expect(formatLastSeen(ago(60 * MINUTE), NOW, TZ)).toBe(
      "Hoạt động 1 giờ trước",
    );
  });

  it("treats a future last-seen as online", () => {
    expect(formatLastSeen(ago(-30 * SECOND), NOW, TZ)).toBe("Đang hoạt động");
  });

  it("uses the local midnight, not 24 hours, for yesterday", () => {
    // now = 00:30 local on 05/11 (17:30Z on 04/11).
    const now = new Date("2026-11-04T17:30:00Z");

    // 23:50 local on 04/11 is 40 min ago but on the previous local day.
    expect(formatLastSeen(new Date(now.getTime() - 40 * MINUTE), now, TZ)).toBe(
      "Hoạt động hôm qua",
    );
    // 00:10 local the same day is 20 min ago.
    expect(formatLastSeen(new Date(now.getTime() - 20 * MINUTE), now, TZ)).toBe(
      "Hoạt động 20 phút trước",
    );
  });

  it("says hours earlier the same local day", () => {
    expect(formatLastSeen(ago(9 * HOUR), NOW, TZ)).toBe(
      "Hoạt động 9 giờ trước",
    );
  });

  it("says yesterday for the previous local day", () => {
    expect(formatLastSeen(ago(20 * HOUR), NOW, TZ)).toBe("Hoạt động hôm qua");
  });

  it("shows dd/MM for older dates in the same year", () => {
    expect(formatLastSeen(ago(5 * 24 * HOUR), NOW, TZ)).toBe("Hoạt động 31/10");
  });

  it("adds the year across a year boundary", () => {
    const now = new Date("2027-01-03T03:00:00Z");

    expect(formatLastSeen(new Date("2026-12-28T03:00:00Z"), now, TZ)).toBe(
      "Hoạt động 28/12/2026",
    );
  });

  it("uses the local day across a UTC date change", () => {
    // 01:00 local on 01/01/2027 is 18:00Z on 31/12/2026.
    const now = new Date("2026-12-31T18:00:00Z");

    // 23:30 local on 31/12 is 1.5 h ago but on the previous local day.
    expect(formatLastSeen(new Date("2026-12-31T16:30:00Z"), now, TZ)).toBe(
      "Hoạt động hôm qua",
    );
    expect(formatLastSeen(new Date("2026-12-30T16:30:00Z"), now, TZ)).toBe(
      "Hoạt động 30/12/2026",
    );
  });
});

describe("latestSeen / serialize / parse", () => {
  it("picks the newest, ignoring nulls", () => {
    const a = new Date("2026-11-05T01:00:00Z");
    const b = new Date("2026-11-05T02:00:00Z");

    expect(latestSeen([a, null, b])).toEqual(b);
    expect(latestSeen([null, null])).toBeNull();
    expect(latestSeen([])).toBeNull();
  });

  it("round-trips ISO strings and rejects garbage", () => {
    const date = new Date("2026-11-05T02:00:00Z");

    expect(serializeLastSeen(date)).toBe("2026-11-05T02:00:00.000Z");
    expect(serializeLastSeen(null)).toBeNull();
    expect(parseLastSeen("2026-11-05T02:00:00.000Z")).toEqual(date);
    expect(parseLastSeen("nope")).toBeNull();
    expect(parseLastSeen(null)).toBeNull();
  });
});
