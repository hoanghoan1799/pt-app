import { describe, expect, it } from "vitest";

import { pushContent } from "./index.js";
import { buildReportPush } from "./report-content.js";

describe("buildReportPush", () => {
  it("names the kind of the report in the recipient's language", () => {
    expect(buildReportPush({ kind: "message", locale: "vi" }).body).toBe(
      "Báo cáo mới: tin nhắn",
    );
    expect(buildReportPush({ kind: "comment", locale: "en" }).body).toBe(
      "New report: comment",
    );
    expect(buildReportPush({ kind: "user", locale: "zh" }).body).toBe(
      "新举报：用户",
    );
  });

  it("opens the report queue under one replaceable tag, in Vietnamese by default", () => {
    expect(buildReportPush({ kind: "post" })).toEqual({
      title: "PT App",
      body: "Báo cáo mới: bài viết",
      url: "/admin/reports",
      tag: "reports",
    });
  });

  it("is the report entry of pushContent", () => {
    expect(pushContent.report).toBe(buildReportPush);
  });
});
