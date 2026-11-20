import { describe, expect, it } from "vitest";

import {
  type ApiReport,
  toReportView,
} from "@/features/social/utils/social-mappers";

// The reports queue row of `GET /v1/social/reports` (company
// social-report-group-messages.test.ts, the queue part): a group message
// report keeps its own kind, names its group and links to it.

const report = (overrides: Partial<ApiReport> = {}): ApiReport => ({
  id: 9,
  targetKind: "group_message",
  targetId: 41,
  reporterName: "Lan",
  reason: "",
  reasonCode: "harassment",
  createdAt: "2026-11-20T08:00:00.000Z",
  preview: "tin nhắn xấu",
  targetName: "Minh",
  postId: null,
  message: {
    senderRole: "user",
    senderName: "Minh",
    traineeId: 12,
    traineeName: "Minh",
    kind: "text",
  },
  group: { id: 3, name: "Lớp sáng" },
  ...overrides,
});

describe("toReportView", () => {
  it("keeps a group message report as such, with its group and a link to it", () => {
    expect(toReportView(report())).toEqual({
      id: 9,
      targetKind: "group_message",
      targetId: 41,
      reporterName: "Lan",
      reason: "",
      reasonCode: "harassment",
      message: {
        senderRole: "user",
        senderName: "Minh",
        traineeId: 12,
        traineeName: "Minh",
        kind: "text",
      },
      group: { id: 3, name: "Lớp sáng" },
      createdAt: Date.parse("2026-11-20T08:00:00.000Z"),
      preview: "tin nhắn xấu",
      targetName: "Minh",
      href: "/admin/messages/groups/3",
    });
  });

  it("has no link once the group message is gone (unsent or hidden)", () => {
    const view = toReportView(
      report({ preview: null, targetName: null, message: null, group: null }),
    );

    expect(view).toMatchObject({ group: null, message: null, href: null });
  });

  it("leaves a coach chat report on the chat, without a group", () => {
    const view = toReportView(
      report({
        targetKind: "message",
        targetId: 77,
        group: undefined,
        message: {
          senderRole: "user",
          senderName: "Minh",
          traineeId: 12,
          traineeName: "Minh",
          kind: "text",
        },
      }),
    );

    expect(view.targetKind).toBe("message");
    expect(view.group).toBeNull();
    expect(view.href).toBe("/admin/users/12/messages?m=77");
  });
});
