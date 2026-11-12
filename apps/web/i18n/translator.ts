import { createTranslator } from "next-intl";

import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/utils/locale";

// For code that runs outside a request (push payloads, services, tests), where
// useTranslations/getTranslations are unavailable.
export const getTranslator = <N extends keyof ReturnType<typeof getMessages>>(
  locale: Locale,
  namespace: N,
) =>
  createTranslator({
    locale,
    messages: getMessages(locale),
    namespace,
    timeZone: "Asia/Ho_Chi_Minh",
  });
