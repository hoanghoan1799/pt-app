import type { PushPayload, SocialReportTargetKind } from "@pt/contracts";

import {
  DEFAULT_LOCALE,
  type Locale,
} from "../../social/notifications/notification-content.js";
import { PUSH_TITLE } from "./chat-content.js";

// The push every super admin gets for a new report, ported from the web
// (messages/{vi,en,zh}/push.json: report, reportKinds). It names the kind of
// the report only, never the reported content: the lock screen is semi-public.

const TEXTS = {
  vi: {
    report: "Báo cáo mới: {kind}",
    kinds: {
      post: "bài viết",
      comment: "bình luận",
      user: "người dùng",
      message: "tin nhắn",
      group_message: "tin nhắn nhóm",
    },
  },
  en: {
    report: "New report: {kind}",
    kinds: {
      post: "post",
      comment: "comment",
      user: "user",
      message: "message",
      group_message: "group message",
    },
  },
  zh: {
    report: "新举报：{kind}",
    kinds: {
      post: "帖子",
      comment: "评论",
      user: "用户",
      message: "消息",
      group_message: "群消息",
    },
  },
} as const;

export const ADMIN_REPORTS_PATH = "/admin/reports";

export type ReportFacts = {
  kind: SocialReportTargetKind;
  locale?: Locale;
};

export const buildReportPush = ({
  kind,
  locale = DEFAULT_LOCALE,
}: ReportFacts): PushPayload => ({
  title: PUSH_TITLE,
  body: TEXTS[locale].report.replaceAll("{kind}", TEXTS[locale].kinds[kind]),
  url: ADMIN_REPORTS_PATH,
  // One notification for the queue: a newer report replaces the older one.
  tag: "reports",
});
