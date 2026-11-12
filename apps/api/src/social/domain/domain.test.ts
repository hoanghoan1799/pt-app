import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { SocialActor } from "../social-actor.js";
import { shouldNotifyAdminPost } from "./admin-post.js";
import { CommentPolicy } from "./comment.policy.js";
import {
  decodeIdCursor,
  decodeTimeCursor,
  encodeCursor,
  idCursor,
  timeCursor,
} from "./cursor.js";
import { checkPhoto, sniffPhotoMime } from "./photo-check.js";
import { summarizeReactions } from "./reactions.js";
import { rowsOf } from "./rows.js";
import { canViewTrainingStats, computeDayStreak } from "./streak.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("comment rights", () => {
  const policy = new CommentPolicy();
  const user = (id: number): SocialActor => ({ kind: "user", id });
  const superAdmin: SocialActor = { kind: "admin", id: 1, role: "super_admin", revealed: false };
  const pt: SocialActor = { kind: "admin", id: 2, role: "pt", revealed: false };

  it("lets only the commenter edit", () => {
    expect(policy.canEdit(user(5), { authorKey: "user:5" })).toBe(true);
    expect(policy.canEdit(user(5), { authorKey: "user:6" })).toBe(false);
    expect(policy.canEdit(superAdmin, { authorKey: "user:5" })).toBe(false);
    expect(policy.canEdit(user(2), { authorKey: "admin:2" })).toBe(false);
  });

  it("lets the commenter, the post author and a super admin delete", () => {
    const post = { kind: "user" as const, id: 9 };
    const comment = { authorKey: "user:5" };

    expect(policy.canDelete(user(5), comment, post)).toBe(true);
    expect(policy.canDelete(user(9), comment, post)).toBe(true);
    expect(policy.canDelete(superAdmin, comment, post)).toBe(true);
    expect(policy.canDelete(user(6), comment, post)).toBe(false);
    expect(policy.canDelete(pt, comment, post)).toBe(false);
    expect(policy.canDelete(pt, comment, { kind: "admin", id: 2 })).toBe(true);
  });
});

describe("reaction summary", () => {
  it("counts per emoji, most used first, with my own", () => {
    const rows = [
      { reactorKey: "user:1", emoji: "❤️" },
      { reactorKey: "user:2", emoji: "👍" },
      { reactorKey: "user:3", emoji: "👍" },
      { reactorKey: "admin:1", emoji: "💪" },
      { reactorKey: "user:4", emoji: "😂" },
    ];

    expect(summarizeReactions(rows, "user:3")).toEqual({
      counts: [
        { emoji: "👍", count: 2 },
        { emoji: "❤️", count: 1 },
        { emoji: "💪", count: 1 },
      ],
      total: 5,
      mine: "👍",
    });
    expect(summarizeReactions([], "user:1")).toEqual({ counts: [], total: 0, mine: null });
    expect(summarizeReactions(rows, "admin:9").mine).toBeNull();
  });
});

describe("streak", () => {
  it("counts consecutive days back from today, or from yesterday when today is empty", () => {
    expect(computeDayStreak(["2026-11-12", "2026-11-11", "2026-11-10"], "2026-11-12")).toBe(3);
    expect(computeDayStreak(["2026-11-11", "2026-11-10"], "2026-11-12")).toBe(2);
    expect(computeDayStreak(["2026-11-10"], "2026-11-12")).toBe(0);
    expect(computeDayStreak(["2026-11-12", "2026-11-10"], "2026-11-12")).toBe(1);
    expect(computeDayStreak([], "2026-11-12")).toBe(0);
    expect(computeDayStreak(["2026-11-11", "2026-11-12", "2026-11-11"], "2026-11-12")).toBe(2);
  });

  it("shows stats to the owner, a friend and admins only", () => {
    const base = { isOwn: false, isAdminViewer: false, relationship: null };

    expect(canViewTrainingStats({ ...base, isOwn: true })).toBe(true);
    expect(canViewTrainingStats({ ...base, isAdminViewer: true })).toBe(true);
    expect(canViewTrainingStats({ ...base, relationship: "friends" })).toBe(true);
    expect(canViewTrainingStats({ ...base, relationship: "sent" })).toBe(false);
    expect(canViewTrainingStats({ ...base, relationship: "none" })).toBe(false);
    expect(canViewTrainingStats(base)).toBe(false);
  });
});

describe("cursors", () => {
  it("round-trips post and time cursors", () => {
    expect(decodeIdCursor(idCursor(42))).toBe(42);
    const at = new Date("2026-11-12T10:00:00.123Z");

    expect(decodeTimeCursor(timeCursor(at, 7))).toEqual({ at: at.toISOString(), id: 7 });
  });

  it("rejects anything that is not a cursor this API made", () => {
    const bad = [
      "",
      "%%%",
      "e30",
      encodeCursor([0]),
      encodeCursor([-1]),
      encodeCursor([1.5]),
      encodeCursor(["1"]),
      encodeCursor([1, 2]),
      encodeCursor([2147483648]),
    ];

    for (const cursor of bad) {
      expect(() => decodeIdCursor(cursor), cursor).toThrow(BadRequestException);
    }
    for (const cursor of [
      idCursor(1),
      encodeCursor(["not a date", 1]),
      encodeCursor(["2026-11-12T10:00:00Z", 0]),
      encodeCursor(["2026-11-12T10:00:00Z"]),
    ]) {
      expect(() => decodeTimeCursor(cursor), cursor).toThrow(BadRequestException);
    }
  });
});

describe("photo check", () => {
  it("reads type and size from the bytes", () => {
    expect(sniffPhotoMime(PNG)).toBe("image/png");
    expect(checkPhoto(PNG)).toEqual({ ok: true, mime: "image/png", width: 1, height: 1 });
    expect(sniffPhotoMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(sniffPhotoMime(Buffer.from("RIFF1234WEBPVP8 abcdef"))).toBe("image/webp");
  });

  it("refuses empty, unknown, truncated and oversized-side images", () => {
    expect(checkPhoto(Buffer.alloc(0))).toEqual({ ok: false, error: "empty" });
    expect(checkPhoto(Buffer.from("hello world, not an image"))).toEqual({ ok: false, error: "bad_image" });
    expect(checkPhoto(PNG.subarray(0, 20))).toEqual({ ok: false, error: "bad_image" });
    expect(checkPhoto(Buffer.alloc(2 * 1024 * 1024, 1))).toEqual({ ok: false, error: "too_large" });

    const wide = Buffer.from(PNG);

    wide.writeUInt32BE(1601, 16);
    expect(checkPhoto(wide)).toEqual({ ok: false, error: "bad_image" });
    wide.writeUInt32BE(1600, 16);
    expect(checkPhoto(wide)).toMatchObject({ ok: true, width: 1600 });
    const zero = Buffer.from(PNG);

    zero.writeUInt32BE(0, 20);
    expect(checkPhoto(zero)).toEqual({ ok: false, error: "bad_image" });
  });
});

describe("admin post audience and query rows", () => {
  it("tells nobody about an only_me post", () => {
    expect(shouldNotifyAdminPost("only_me")).toBe(false);
    expect(shouldNotifyAdminPost("friends")).toBe(true);
    expect(shouldNotifyAdminPost("everyone")).toBe(true);
  });

  it("unwraps TypeORM's [rows, count] for UPDATE and DELETE", () => {
    expect(rowsOf([[{ id: 1 }], 1])).toEqual([{ id: 1 }]);
    expect(rowsOf([[], 0])).toEqual([]);
    expect(rowsOf([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(rowsOf([])).toEqual([]);
  });
});
