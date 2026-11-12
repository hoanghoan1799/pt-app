import type { SocialNotificationKind } from "@pt/contracts";

// Notification content strategy: one builder per kind turns the facts of a
// notification into the list line and the push payload. A new kind is one new
// entry in BUILDERS. Copy comes from the web's messages/{vi,en,zh}/push.json.

export type Locale = "vi" | "en" | "zh";
export const DEFAULT_LOCALE: Locale = "vi";

export const toLocale = (value: string | null | undefined): Locale =>
  value === "en" || value === "zh" || value === "vi" ? value : DEFAULT_LOCALE;

// Comment text shown in a push (the lock screen is semi-public).
export const PUSH_COMMENT_PREVIEW_LENGTH = 60;

const TEXTS = {
  vi: {
    postReaction: "{name} đã bày tỏ cảm xúc về bài viết của bạn",
    postComment: "{name} đã bình luận về bài viết của bạn",
    commented: "{name} đã bình luận: {preview}",
    friendRequest: "{name} đã gửi lời mời kết bạn",
    friendAccepted: "{name} đã chấp nhận lời mời kết bạn",
    adminPostList: "{name} vừa đăng bài mới",
    adminPost: "{name} vừa đăng bài mới: {preview}",
    adminPostPhoto: "{name} vừa đăng một ảnh mới",
    deletedAccount: "Đã xóa",
    postImageOnly: "(Bài viết chỉ có ảnh)",
  },
  en: {
    postReaction: "{name} reacted to your post",
    postComment: "{name} commented on your post",
    commented: "{name} commented: {preview}",
    friendRequest: "{name} sent you a friend request",
    friendAccepted: "{name} accepted your friend request",
    adminPostList: "{name} posted something new",
    adminPost: "{name} posted: {preview}",
    adminPostPhoto: "{name} posted a new photo",
    deletedAccount: "Deleted account",
    postImageOnly: "(Photo-only post)",
  },
  zh: {
    postReaction: "{name} 对你的帖子做出了回应",
    postComment: "{name} 评论了你的帖子",
    commented: "{name} 评论：{preview}",
    friendRequest: "{name} 向你发送了好友请求",
    friendAccepted: "{name} 接受了你的好友请求",
    adminPostList: "{name} 发布了新帖子",
    adminPost: "{name} 发布了新帖子：{preview}",
    adminPostPhoto: "{name} 发布了一张新照片",
    deletedAccount: "已删除的账号",
    postImageOnly: "（仅图片的帖子）",
  },
} as const;

type TextKey = keyof (typeof TEXTS)["vi"];

const fill = (
  locale: Locale,
  key: TextKey,
  values: Record<string, string> = {},
) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    TEXTS[locale][key] as string,
  );

export const deletedAccountName = (locale: Locale) =>
  TEXTS[locale].deletedAccount;
export const postImageOnlyText = (locale: Locale) => TEXTS[locale].postImageOnly;

// Flattened and cut short; used for pushes and report previews.
export const previewText = (body: string, max = PUSH_COMMENT_PREVIEW_LENGTH) => {
  const flat = body.replace(/\s+/g, " ").trim();

  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

export type NotificationFacts = {
  kind: SocialNotificationKind;
  actorName: string;
  locale: Locale;
  recipientKey: string;
  postId: number | null;
  // Only a comment push carries text; an admin post push the caption.
  commentBody?: string;
  caption?: string | null;
};

export type PushPayload = {
  title: string;
  body: string;
  // Web path the push opens; clients map `kind` + `postId` themselves.
  url: string;
  tag: string;
};

export interface NotificationBuilder {
  text(facts: NotificationFacts): string;
  push(facts: NotificationFacts): PushPayload;
}

const postPathFor = (recipientKey: string, postId: number | null) =>
  postId === null
    ? "/"
    : recipientKey.startsWith("admin:")
      ? `/admin/social/post/${postId}`
      : `/post/${postId}`;

const FRIENDS_PATH = "/friends";
const FRIEND_REQUESTS_PATH = "/friends?tab=requests";

const named = (key: TextKey) => (facts: NotificationFacts) =>
  fill(facts.locale, key, { name: facts.actorName });

const BUILDERS: Record<SocialNotificationKind, NotificationBuilder> = {
  post_reaction: {
    text: named("postReaction"),
    push: (facts) => ({
      title: "PT App",
      body: named("postReaction")(facts),
      url: postPathFor(facts.recipientKey, facts.postId),
      tag: `social-react-${facts.postId}`,
    }),
  },
  post_comment: {
    text: named("postComment"),
    push: (facts) => ({
      title: "PT App",
      body: fill(facts.locale, "commented", {
        name: facts.actorName,
        preview: previewText(facts.commentBody ?? ""),
      }),
      url: postPathFor(facts.recipientKey, facts.postId),
      tag: `social-comment-${facts.postId}`,
    }),
  },
  admin_post: {
    text: named("adminPostList"),
    push: (facts) => {
      const preview = previewText(facts.caption ?? "");

      return {
        title: "PT App",
        body:
          preview === ""
            ? fill(facts.locale, "adminPostPhoto", { name: facts.actorName })
            : fill(facts.locale, "adminPost", {
                name: facts.actorName,
                preview,
              }),
        url: postPathFor(facts.recipientKey, facts.postId),
        tag: `social-post-${facts.postId}`,
      };
    },
  },
  friend_request: {
    text: named("friendRequest"),
    push: (facts) => ({
      title: "PT App",
      body: named("friendRequest")(facts),
      url: FRIEND_REQUESTS_PATH,
      tag: "social-friend_request",
    }),
  },
  friend_accepted: {
    text: named("friendAccepted"),
    push: (facts) => ({
      title: "PT App",
      body: named("friendAccepted")(facts),
      url: FRIENDS_PATH,
      tag: "social-friend_accepted",
    }),
  },
};

export const buildNotificationText = (facts: NotificationFacts) =>
  BUILDERS[facts.kind].text(facts);

export const buildNotificationPush = (facts: NotificationFacts) =>
  BUILDERS[facts.kind].push(facts);
