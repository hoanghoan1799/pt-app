import {
  socialCommentResponseSchema,
  socialNotificationPageResponseSchema,
  socialPostResponseSchema,
  socialProfileResponseSchema,
  socialReportResponseSchema,
} from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { parseSearchEmail } from "./friends.service.js";
import {
  socialPhotoUrl,
  toCommentResponse,
  toNotificationPageResponse,
  toPostResponse,
  toProfileResponse,
  toReportResponse,
} from "./mappers.js";

const createdAt = new Date("2026-11-12T10:00:00.000Z");

describe("mappers", () => {
  it("maps a post to ISO dates and a photo URL, and drops anything extra", () => {
    const response = toPostResponse({
      id: 3,
      authorKind: "user",
      authorId: 9,
      authorName: "Ann",
      authorAvatarUrl: null,
      authorVerified: false,
      caption: "hi",
      privacy: "friends",
      photos: [
        { id: 5, width: 100, height: 80 },
        { id: 6, width: 90, height: 90 },
      ],
      createdAt,
      edited: false,
      canEdit: true,
      canDelete: true,
      reactions: { counts: [{ emoji: "👍", count: 1 }], total: 1, mine: null },
      commentCount: 2,
      // Not part of the contract: must not leak.
      ...({ passwordHash: "secret" } as object),
    });

    expect(response).toEqual({
      id: 3,
      authorKind: "user",
      authorId: 9,
      authorName: "Ann",
      authorAvatarUrl: null,
      authorVerified: false,
      caption: "hi",
      privacy: "friends",
      photo: { id: 5, url: "/v1/social/photos/5", width: 100, height: 80 },
      photos: [
        { id: 5, url: "/v1/social/photos/5", width: 100, height: 80 },
        { id: 6, url: "/v1/social/photos/6", width: 90, height: 90 },
      ],
      createdAt: "2026-11-12T10:00:00.000Z",
      edited: false,
      canEdit: true,
      canDelete: true,
      reactions: { counts: [{ emoji: "👍", count: 1 }], total: 1, mine: null },
      commentCount: 2,
    });
    expect(socialPostResponseSchema.parse(response)).toEqual(response);
    expect(socialPhotoUrl(5)).toBe("/v1/social/photos/5");
  });

  it("maps comments, notifications and profiles to their contracts", () => {
    const comment = toCommentResponse({
      id: 1,
      authorKind: "admin",
      authorId: 2,
      authorName: "PT",
      authorAvatarUrl: "/v1/avatars/admin/2?v=1",
      authorVerified: true,
      body: "ok",
      createdAt,
      edited: true,
      canEdit: false,
      canDelete: true,
    });

    expect(socialCommentResponseSchema.parse(comment)).toEqual(comment);
    expect(comment.createdAt).toBe("2026-11-12T10:00:00.000Z");

    const notifications = toNotificationPageResponse({
      items: [
        {
          id: 1,
          kind: "friend_request",
          text: "Ann đã gửi lời mời kết bạn",
          postId: null,
          actorKey: "user:2",
          actorName: "Ann",
          actorAvatarUrl: null,
          createdAt,
          isUnread: true,
        },
      ],
      nextCursor: null,
      unreadCount: 1,
    });

    expect(socialNotificationPageResponseSchema.parse(notifications)).toEqual(
      notifications,
    );

    const profile = toProfileResponse({
      kind: "user",
      id: 2,
      name: "Bạn Ann",
      realName: "Ann",
      alias: "Bạn Ann",
      avatarUrl: null,
      verified: false,
      bio: "",
      role: "trainee",
      isOwn: false,
      relationship: "none",
      friendCount: 0,
      stats: null,
      canBlock: true,
      canReport: true,
      composerPrivacy: null,
    });

    expect(socialProfileResponseSchema.parse(profile)).toEqual(profile);
    expect(
      toReportResponse({
        id: 1,
        targetKind: "post",
        targetId: 3,
        reporterName: "Ann",
        reason: "spam",
        reasonCode: null,
        createdAt,
        preview: null,
        targetName: null,
        postId: null,
        message: null,
        group: null,
      }).createdAt,
    ).toBe("2026-11-12T10:00:00.000Z");
  });

  it("maps a message report with its reason code and message facts", () => {
    const message = {
      senderRole: "user" as const,
      senderName: "Ann",
      traineeId: 2,
      traineeName: "Ann",
      kind: "text" as const,
    };
    const response = toReportResponse({
      id: 5,
      targetKind: "message",
      targetId: 41,
      reporterName: "PT Binh",
      reason: "",
      reasonCode: "harassment",
      createdAt,
      preview: "hello",
      targetName: "Ann",
      postId: null,
      message,
      group: null,
    });

    expect(socialReportResponseSchema.parse(response)).toEqual(response);
    expect(response).toMatchObject({ reasonCode: "harassment", message });
  });

  it("maps a group message report with its group", () => {
    const response = toReportResponse({
      id: 6,
      targetKind: "group_message",
      targetId: 77,
      reporterName: "Ann",
      reason: "",
      reasonCode: "spam",
      createdAt,
      preview: "buy now",
      targetName: "Binh",
      postId: null,
      message: {
        senderRole: "user",
        senderName: "Binh",
        traineeId: 3,
        traineeName: "Binh",
        kind: "text",
      },
      group: { id: 12, name: "Morning crew" },
    });

    expect(socialReportResponseSchema.parse(response)).toEqual(response);
    expect(response.group).toEqual({ id: 12, name: "Morning crew" });
  });
});

describe("parseSearchEmail", () => {
  it("accepts only a whole address, trimmed and lower-cased", () => {
    expect(parseSearchEmail("  An@Mail.COM ")).toBe("an@mail.com");
    expect(parseSearchEmail("an@mail.com")).toBe("an@mail.com");
  });

  it("rejects prefixes, fragments and non-strings", () => {
    for (const value of [
      "an",
      "an@",
      "@mail.com",
      "an@mail",
      "",
      "   ",
      null,
      5,
      undefined,
    ]) {
      expect(parseSearchEmail(value), String(value)).toBeNull();
    }
  });
});
