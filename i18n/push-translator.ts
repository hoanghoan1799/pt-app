import { createTranslator } from "next-intl";

import enPush from "@/messages/en/push.json";
import viPush from "@/messages/vi/push.json";
import type { Locale } from "@/utils/locale";

// Push text is built on the server in the RECIPIENT's language. Like the
// `format` translator it loads only its own namespace, because some rule files
// (engagement-rules) are also imported by client components.
const PUSH_MESSAGES = { vi: viPush, en: enPush } as const;

export const getPushTranslator = (locale: Locale) =>
  createTranslator({
    locale,
    messages: { push: PUSH_MESSAGES[locale] as typeof viPush },
    namespace: "push",
    timeZone: "Asia/Ho_Chi_Minh",
  });
