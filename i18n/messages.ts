import enAuth from "@/messages/en/auth.json";
import enAvatar from "@/messages/en/avatar.json";
import enChat from "@/messages/en/chat.json";
import enCommon from "@/messages/en/common.json";
import enLayout from "@/messages/en/layout.json";
import enPages from "@/messages/en/pages.json";
import enPwa from "@/messages/en/pwa.json";
import enSocial from "@/messages/en/social.json";
import enWorkouts from "@/messages/en/workouts.json";
import viAuth from "@/messages/vi/auth.json";
import viAvatar from "@/messages/vi/avatar.json";
import viChat from "@/messages/vi/chat.json";
import viCommon from "@/messages/vi/common.json";
import viLayout from "@/messages/vi/layout.json";
import viPages from "@/messages/vi/pages.json";
import viPwa from "@/messages/vi/pwa.json";
import viSocial from "@/messages/vi/social.json";
import viWorkouts from "@/messages/vi/workouts.json";
import type { Locale } from "@/utils/locale";

// One object per locale, keyed by namespace. Files are imported statically (no
// dynamic fs) so they bundle on every runtime. Add a namespace here and in
// both messages/<locale>/ folders; i18n/__tests__/messages.test.ts checks them.
export const MESSAGES = {
  vi: {
    auth: viAuth,
    avatar: viAvatar,
    chat: viChat,
    common: viCommon,
    layout: viLayout,
    pages: viPages,
    pwa: viPwa,
    social: viSocial,
    workouts: viWorkouts,
  },
  en: {
    auth: enAuth,
    avatar: enAvatar,
    chat: enChat,
    common: enCommon,
    layout: enLayout,
    pages: enPages,
    pwa: enPwa,
    social: enSocial,
    workouts: enWorkouts,
  },
} as const satisfies Record<Locale, Record<string, object>>;

export const viMessages = MESSAGES.vi;

export const getMessages = (locale: Locale) => MESSAGES[locale];
