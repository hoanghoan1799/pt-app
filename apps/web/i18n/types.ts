import type { viMessages } from "@/i18n/messages";
import type { Locale as AppLocale } from "@/utils/locale";

// Makes next-intl check every t("key") against the Vietnamese messages.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof viMessages;
  }
}
