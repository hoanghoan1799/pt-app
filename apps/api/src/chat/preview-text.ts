import { DM_MESSAGES } from "@pt/contracts";

import {
  type Locale,
  toLocale,
} from "../social/notifications/notification-content.js";

// The words of an inbox / list preview line in the READER's language (the
// signed-in actor's saved locale, like push text). Ported from the web's
// messages/{vi,en,zh}/format.json so the BFF shows them as they come.
const TEXTS = {
  vi: {
    sticker: "đã gửi một sticker",
    photo: "Ảnh",
    unsent: DM_MESSAGES.UNSENT,
    you: "Bạn: ",
    deletedAccount: "Đã xoá",
  },
  en: {
    sticker: "sent a sticker",
    photo: "Photo",
    unsent: "This message was unsent",
    you: "You: ",
    deletedAccount: "Deleted account",
  },
  zh: {
    sticker: "发送了一个贴纸",
    photo: "照片",
    unsent: "此消息已撤回",
    you: "你：",
    deletedAccount: "已删除的账号",
  },
} as const;

export const previewTexts = (locale?: Locale | string | null) =>
  TEXTS[toLocale(locale)];
