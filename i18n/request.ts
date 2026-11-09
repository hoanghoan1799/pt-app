import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { getMessages } from "@/i18n/messages";
import { LOCALE_COOKIE, parseLocale } from "@/utils/locale";

// "Without i18n routing": no URL prefix, the locale comes from the cookie that
// setLocaleAction writes, falling back to Vietnamese.
export default getRequestConfig(async () => {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);

  return {
    locale,
    messages: getMessages(locale),
    // Fixed so server and client format dates the same way.
    timeZone: "Asia/Ho_Chi_Minh",
  };
});
